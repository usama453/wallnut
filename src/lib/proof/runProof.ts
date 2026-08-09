import { createAdminClient } from "@/lib/supabase/server";
import { normalizeImage } from "@/lib/image";
import { renderPdfFirstPage } from "@/lib/pdf";
import { getProvider } from "@/lib/ai";
import { spellcheck } from "./spellcheck";
import { sanitizeText } from "@/lib/text";
import type { BrandContext, PreviousProofContext, RawIssue, RawReport } from "@/lib/ai";

export const BUCKET = "artifacts";

export interface RunProofResult {
  proofId: string;
  report: RawReport;
  ocrText: string;
  model: string;
  ocrConfidence: number;
}

/**
 * Full proof pipeline for a stored version:
 * 1. load bytes from storage   2. rasterize PDF if needed
 * 3. normalize image           4. OCR (Tesseract)
 * 5. gather brand + previous version context
 * 6. run the configured AI provider
 * 7. persist proof + issues
 */
export async function runProof(assetVersionId: string): Promise<RunProofResult> {
  const admin = await createAdminClient();

  const { data: version, error: vErr } = await admin
    .from("asset_versions")
    .select("id, asset_id, storage_path, version, url")
    .eq("id", assetVersionId)
    .single();
  if (vErr || !version) throw new Error("asset version not found");

  const { data: asset, error: aErr } = await admin
    .from("assets")
    .select("id, org_id, name, kind, mime, current_version")
    .eq("id", version.asset_id)
    .single();
  if (aErr || !asset) throw new Error("asset not found");

  // 1. load bytes
  const { data: file, error: fErr } = await admin.storage
    .from(BUCKET)
    .download(version.storage_path);
  if (fErr || !file) throw new Error("failed to load file from storage");
  const bytes = Buffer.from(await file.arrayBuffer());

  // 2-3. rasterize PDF or normalize image
  let image: { buffer: Buffer; mimeType: string } = { buffer: bytes, mimeType: asset.mime };
  if (asset.kind === "pdf") {
    const page = await renderPdfFirstPage(bytes);
    image = { buffer: page.buffer, mimeType: "image/png" };
  }
  const normalized = await normalizeImage(image.buffer);

  // 4. OCR (skipped on serverless runtimes where Tesseract's wasm can't load;
  // the AI model reads the image directly when OCR text is empty)
  let ocr = { text: "", confidence: 0 };
  const ocrEnabled = process.env.OCR_ENABLED === "1" || process.env.VERCEL !== "1";
  if (ocrEnabled) {
    const { extractText } = await import("@/lib/ocr/tesseract");
    ocr = await extractText(normalized.buffer);
  }

  // 5. context
  const brand = await loadBrand(admin, asset.org_id);
  const previous = await loadPreviousProof(admin, version.asset_id, version.version);

  // 6. AI
  const provider = getProvider();
  const { report } = await provider.analyzeAsset({
    imageBase64: normalized.base64,
    mimeType: normalized.mimeType,
    ocrText: ocr.text,
    brand,
    previous,
  });

  // 6b. Deterministic spellcheck pass over the transcribed text (OCR when
  // available, otherwise the model's verbatim transcription). Catches typos
  // the vision model may gloss over.
  mergeSpellcheck(report, ocr.text, brand, asset.name);

  // 7. persist
  const proofId = await persistProof(admin, {
    assetVersionId,
    assetId: asset.id,
    versionNumber: version.version,
    report,
    ocrText: ocr.text,
    model: provider.name,
  });

  return {
    proofId,
    report,
    ocrText: ocr.text,
    model: provider.name,
    ocrConfidence: ocr.confidence,
  };
}

async function loadBrand(admin: any, orgId: string): Promise<BrandContext | null> {
  const { data } = await admin
    .from("brand_profiles")
    .select("*")
    .eq("org_id", orgId)
    .limit(1)
    .maybeSingle();
  if (!data) return null;

  return {
    company_name: data.company_name,
    colors: data.colors ?? [],
    fonts: data.fonts ?? [],
    tone_of_voice: data.tone_of_voice,
    preferred_terminology: data.preferred_terminology ?? [],
    banned_words: data.banned_words ?? [],
    style_guide: data.style_guide,
  };
}

async function loadPreviousProof(
  admin: any,
  assetId: string,
  currentVersion: number,
): Promise<PreviousProofContext | null> {
  if (currentVersion <= 1) return null;

  const { data: prevVersion } = await admin
    .from("asset_versions")
    .select("id, version")
    .eq("asset_id", assetId)
    .eq("version", currentVersion - 1)
    .single();

  if (!prevVersion) return null;

  const { data: proof } = await admin
    .from("proofs")
    .select("*")
    .eq("asset_version_id", prevVersion.id)
    .maybeSingle();
  if (!proof) return null;

  const { data: issues } = await admin
    .from("proof_issues")
    .select("title, category")
    .eq("proof_id", proof.id)
    .limit(50);

  return {
    version: prevVersion.version,
    score: proof.score,
    status: proof.status,
    summary: proof.summary,
    issues: issues ?? [],
    ocr_text: proof.ocr_text,
  };
}

async function persistProof(
  admin: any,
  args: {
    assetVersionId: string;
    assetId: string;
    versionNumber: number;
    report: RawReport;
    ocrText: string;
    model: string;
  },
): Promise<string> {
  const { data: proof, error } = await admin
    .from("proofs")
    .insert({
      asset_version_id: args.assetVersionId,
      score: args.report.score,
      status: args.report.status,
      summary: args.report.summary,
      ocr_text: args.ocrText,
      model: args.model,
      raw: args.report,
    })
    .select("id")
    .single();
  if (error || !proof) throw new Error(`failed to save proof: ${error?.message}`);

  const issueRows = args.report.issues.map((issue) => ({
    proof_id: proof.id,
    category: issue.category,
    severity: issue.severity,
    title: issue.title,
    description: issue.description ?? null,
    suggestion: issue.suggestion ?? null,
    x: issue.location?.x ?? null,
    y: issue.location?.y ?? null,
    w: issue.location?.w ?? null,
    h: issue.location?.h ?? null,
  }));

  if (issueRows.length) {
    const { error: iErr } = await admin.from("proof_issues").insert(issueRows);
    if (iErr) throw new Error(`failed to save issues: ${iErr.message}`);
  }

  // if there are high-severity issues, mark asset as changes_requested
  if (args.report.status === "errors") {
    await admin
      .from("assets")
      .update({ status: "changes_requested" })
      .eq("id", args.assetId);
  } else if (args.report.status === "needs_review") {
    await admin
      .from("assets")
      .update({ status: "in_review" })
      .eq("id", args.assetId);
  }

  return proof.id;
}

/**
 * Merges deterministic spellcheck findings into the model report:
 * - skips words the model already flagged
 * - respects brand/asset terms as intentional
 * - appends new typos and adjusts score/status so they're reflected
 */
function mergeSpellcheck(
  report: RawReport,
  ocrText: string,
  brand: BrandContext | null,
  assetName: string,
) {
  const source = sanitizeText((ocrText || report.extractedText || "").trim());
  if (!source) return;

  const allow = [
    assetName,
    brand?.company_name ?? "",
    ...(brand?.preferred_terminology ?? []),
    ...(brand?.fonts ?? []),
  ].filter(Boolean);

  const alreadyFlagged = new Set<string>();
  for (const issue of report.issues) {
    const hay = `${issue.title} ${issue.description ?? ""} ${issue.suggestion ?? ""}`.toLowerCase();
    for (const word of hay.split(/[^a-z']+/i)) {
      if (word.length >= 2) alreadyFlagged.add(word.toLowerCase());
    }
  }

  const findings = spellcheck(source, { allow });
  const newIssues: RawIssue[] = [];
  for (const f of findings) {
    // Aggregated proper-noun / acronym bucket → a single low-severity issue.
    if (f.words?.length) {
      const filtered = f.words.filter((w) => !alreadyFlagged.has(w.toLowerCase()));
      if (!filtered.length) continue;
      const count = filtered.length;
      newIssues.push({
        category: "typography",
        severity: "low",
        title: `${count} word${count === 1 ? "" : "s"} may be proper nouns or brand names`,
        description: `Not in the dictionary: ${filtered.join(", ")}.`,
        suggestion:
          "Verify the spelling, or add names to Brand profile → Preferred terminology to stop them being flagged.",
      });
      continue;
    }

    const lower = f.word.toLowerCase();
    if (alreadyFlagged.has(lower)) continue;

    newIssues.push({
      category: "typography",
      severity: f.severity,
      title: `Misspelled "${f.word}"${f.count > 1 ? ` (×${f.count})` : ""}`,
      description: f.context
        ? `Found in: "${f.context}"`
        : `Appears ${f.count}× in the artwork.`,
      suggestion:
        f.suggestions.length > 0
          ? `Did you mean: ${f.suggestions.join(", ")}?`
          : "Verify the intended spelling.",
    });
  }

  if (!newIssues.length) return;

  report.issues = [...report.issues, ...newIssues];
  const penalty = newIssues.reduce((sum, i) => sum + (i.severity === "medium" ? 3 : 1), 0);
  report.score = Math.max(0, Math.round(report.score - penalty));
  if (report.score >= 90 && !report.issues.some((i) => i.severity === "high")) {
    report.status = "passed";
  } else if (report.score >= 70) {
    report.status = "needs_review";
  } else {
    report.status = "errors";
  }
}
