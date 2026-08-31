import { createAdminClient } from "@/lib/supabase/server";
import { normalizeImage } from "@/lib/image";
import { renderPdfAllPages } from "@/lib/pdf";
import { getProvider } from "@/lib/ai";
import { getProofPipelineMode, type ProofPipelineMode } from "./pipeline-mode-store";
import { getProofAdminSettings } from "./proof-settings-store";
import { filterIssuesByChecks } from "./issue-checks";
import { hasEnabledProofChecks, type ProofChecksConfig } from "./proof-settings";
import { spellcheck, findSmoothedBrokenWords, preferBrokenSpellingText } from "./spellcheck";
import { detectRomanUrduLines } from "./roman-urdu";
import {
  enrichIssueLocations,
  extractQuotedWords,
  locateWord,
  type LocationContext,
} from "./issue-locations";
import { buildHumanReplyFallback } from "@/lib/reportSummary";
import { isAllGoodDirectResponse } from "@/lib/proof/direct-response";
import { sanitizeText } from "@/lib/text";
import type { OcrResult } from "@/lib/ocr/tesseract";
import type { BrandContext, PreviousProofContext, RawIssue, RawReport } from "@/lib/ai";

export const BUCKET = "artifacts";

export interface RunProofResult {
  proofId: string;
  report: RawReport;
  ocrText: string;
  model: string;
  ocrConfidence: number;
  pipelineMode: ProofPipelineMode;
}

/**
 * Full proof pipeline for a stored version:
 * 1. load bytes from storage   2. rasterize PDF if needed
 * 3. normalize image           4. OCR (Tesseract, when available)
 * 5. gather brand + previous version context
 * 6a. AI stage 1 — transcribe visible text + image context
 * 6b. AI stage 2 — visual/brand QA (no spelling)
 * 6c. deterministic spellcheck on stage-1 text
 * 7. persist proof + issues
 */
export async function runProof(assetVersionId: string): Promise<RunProofResult> {
  const admin = await createAdminClient();

  const { data: version, error: vErr } = await admin
    .from("asset_versions")
    .select("id, asset_id, storage_path, version, url, width, height")
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
    const page = await renderPdfAllPages(bytes);
    image = { buffer: page[0], mimeType: "image/png" };
  }
  const normalized = await normalizeImage(image.buffer);

  // 3b. Build per-page preview thumbnails so the viewers can render the full
  // document (PDFs only; images use their stored URL). For PDF pages the
  // annotation coordinates are relative to the analyzed (normalized) page 1,
  // which keeps the existing marker positioning valid per page.
  const previewMeta = await storePreviews(admin, {
    bucket: BUCKET,
    assetId: asset.id,
    version: version.version,
    orgId: asset.org_id,
    isPdf: asset.kind === "pdf",
    bytes,
    page1: { buffer: normalized.buffer, mimeType: normalized.mimeType, width: normalized.width, height: normalized.height },
  });
  if (previewMeta) {
    const updates: Record<string, unknown> = { preview_meta: previewMeta };
    if (asset.kind === "pdf") {
      updates.preview_url = previewMeta.pages[0]?.url ?? null;
    } else {
      updates.width = normalized.width;
      updates.height = normalized.height;
    }
    await admin.from("asset_versions").update(updates).eq("id", version.id);
  }


  // 4. OCR — skipped in Gemini-only mode; split pipeline uses it as a transcription hint.
  const pipelineMode = await getProofPipelineMode(asset.org_id);
  const proofSettings = await getProofAdminSettings(asset.org_id);
  const enabledChecks = proofSettings.checks;
  let ocr: OcrResult = { text: "", confidence: 0, words: [], width: 0, height: 0 };
  const ocrEnabled =
    pipelineMode !== "gemini_only" &&
    (process.env.OCR_ENABLED === "1" || process.env.VERCEL !== "1");
  if (ocrEnabled) {
    const { extractText } = await import("@/lib/ocr/tesseract");
    ocr = await extractText(normalized.buffer);
  }

  // 5. context
  const brand = await loadBrand(admin, asset.org_id);
  const previous = await loadPreviousProof(admin, version.asset_id, version.version);

  const provider = getProvider();
  let report: RawReport;
  let modelLabel = provider.name;

  if (pipelineMode === "gemini_only") {
    const { rawText } = await provider.proofAssetDirect({
      imageBase64: normalized.base64,
      mimeType: normalized.mimeType,
    });
    const directResponse = sanitizeText(rawText.trim());
    const allGood = isAllGoodDirectResponse(directResponse);
    report = {
      score: allGood ? 100 : 70,
      status: allGood ? "passed" : "needs_review",
      summary: directResponse,
      issues: [],
      directResponse,
      humanReply: directResponse,
    };
    modelLabel = `${provider.name} · direct`;
  } else {
    const transcription = await provider.transcribeAsset({
      imageBase64: normalized.base64,
      mimeType: normalized.mimeType,
      ocrText: ocr.text,
      brand,
    });
    const geminiText = sanitizeText((transcription.extractedText || "").trim());
    const canonicalText = sanitizeText(
      preferBrokenSpellingText(geminiText, ocr.text || "").trim() ||
        ocr.text ||
        geminiText,
    );

    const analyzed = await provider.analyzeAsset({
      imageBase64: normalized.base64,
      mimeType: normalized.mimeType,
      ocrText: ocr.text,
      brand,
      previous,
      extractedText: canonicalText,
      imageContext: transcription.imageContext,
      enabledChecks,
    });
    report = analyzed.report;

    report.extractedText = canonicalText;
    report.issues = stripSpellingIssues(report.issues, canonicalText);

    const locationContext: LocationContext = {
      canonicalText,
      imageWidth: ocr.width || normalized.width,
      imageHeight: ocr.height || normalized.height,
      ocrWords: ocr.words,
    };

    if (!brand?.allow_slang_roman_urdu && canonicalText && enabledChecks.typos) {
      mergeSpellcheck(
        report,
        canonicalText,
        brand,
        asset.name,
        locationContext,
        ocr.text,
        geminiText,
      );
      if (!hasTypoIssues(report.issues)) {
        try {
          const visualTypos = await provider.auditVisibleTypos({
            imageBase64: normalized.base64,
            mimeType: normalized.mimeType,
            transcribedText: canonicalText,
            brand,
          });
          if (visualTypos.length) {
            report.issues = [...report.issues, ...visualTypos];
          }
        } catch (err) {
          console.error(
            `[proof] visual typo audit failed: ${err instanceof Error ? err.message : err}`,
          );
        }
      }
    }

    enrichIssueLocations(report.issues, locationContext);
  }

  if (pipelineMode !== "gemini_only") {
    report.issues = filterIssuesByChecks(report.issues, enabledChecks);
    if (!hasEnabledProofChecks(enabledChecks)) {
      report.issues = [];
    }
    finalizeReport(report);

    try {
      report.humanReply = await provider.generateHumanReply(report);
    } catch (err) {
      console.error(
        `[proof] human reply generation failed: ${err instanceof Error ? err.message : err}`,
      );
      report.humanReply = buildHumanReplyFallback(report.issues);
    }
  }

  // 7. persist
  const proofId = await persistProof(admin, {
    assetVersionId,
    assetId: asset.id,
    versionNumber: version.version,
    report,
    ocrText: ocr.text,
    model: modelLabel,
    pipelineMode,
    enabledChecks,
  });

  return {
    proofId,
    report,
    ocrText: ocr.text,
    model: modelLabel,
    ocrConfidence: ocr.confidence,
    pipelineMode,
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
    allow_slang_roman_urdu: data.allow_slang_roman_urdu ?? false,
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
    pipelineMode: ProofPipelineMode;
    enabledChecks: ProofChecksConfig;
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
      raw: {
        ...args.report,
        pipeline_mode: args.pipelineMode,
        enabled_checks: args.enabledChecks,
      },
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
 * Drop spelling/typo findings from the QA model — typos come from spellcheck
 * against the stage-1 transcription, not from LLM imagination.
 */
function isVisualTypoIssue(issue: RawIssue): boolean {
  const hay = `${issue.title} ${issue.description ?? ""} ${issue.suggestion ?? ""}`.toLowerCase();
  return /visible typo|printed on the image|shown on the image|split letter|letter gap/i.test(hay);
}

function hasTypoIssues(issues: RawIssue[]): boolean {
  return issues.some(
    (issue) =>
      isVisualTypoIssue(issue) ||
      /^misspelled "/i.test(issue.title) ||
      /typo|misspell/i.test(`${issue.title} ${issue.suggestion ?? ""}`),
  );
}

function stripSpellingIssues(issues: RawIssue[], canonicalText: string): RawIssue[] {
  const haystack = canonicalText.toLowerCase();
  const lines = canonicalText.split("\n");
  const romanLines = detectRomanUrduLines(canonicalText);
  return issues.filter((issue) => {
    if (!isSpellingIssue(issue)) return true;
    if (isVisualTypoIssue(issue)) return true;
    const quoted = extractQuotedWords(issue);
    if (!quoted.length) return false;
    if (
      quoted.some((word) => {
        const lineIdx = findWordLineIndex(lines, word);
        return lineIdx >= 0 && romanLines[lineIdx];
      })
    ) {
      return false;
    }
    return quoted.some((word) => wordAppearsInText(word, haystack));
  });
}

function findWordLineIndex(lines: string[], word: string): number {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\b${escaped}\\b`, "i");
  return lines.findIndex((line) => re.test(line));
}

function isSpellingIssue(issue: RawIssue): boolean {
  const cat = issue.category.toLowerCase();
  const hay = `${issue.title} ${issue.description ?? ""} ${issue.suggestion ?? ""}`.toLowerCase();
  if (cat !== "text" && cat !== "typography") return false;
  return (
    /misspell|typo|spelling|did you mean|should be spelled|wrong spelling/i.test(hay)
    || /^misspelled "/i.test(issue.title)
  );
}

function wordAppearsInText(word: string, haystack: string): boolean {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(haystack);
}

function finalizeReport(report: RawReport) {
  const hasHigh = report.issues.some((issue) => issue.severity === "high");
  const penalty = report.issues.reduce((sum, issue) => {
    if (issue.severity === "high") return sum + 15;
    if (issue.severity === "medium") return sum + 8;
    return sum + 3;
  }, 0);
  report.score = Math.max(0, Math.round(100 - penalty));
  if (report.score >= 90 && !hasHigh) report.status = "passed";
  else if (report.score >= 70) report.status = "needs_review";
  else report.status = "errors";
}

/**
 * Merges deterministic spellcheck findings into the model report:
 * - skips words the model already flagged
 * - respects brand/asset terms as intentional
 * - appends new typos and adjusts score/status so they're reflected
 */
function mergeSpellcheck(
  report: RawReport,
  sourceText: string,
  brand: BrandContext | null,
  assetName: string,
  locationContext: LocationContext,
  ocrText = "",
  geminiText = "",
) {
  // Casual language mode: Roman Urdu spellings are intentionally loose, so a
  // dictionary spellcheck produces false positives. Semantic coherence is
  // handled by the AI provider instead (see the prompt's CASUAL LANGUAGE MODE).
  if (brand?.allow_slang_roman_urdu) return;

  const source = sanitizeText(sourceText.trim());
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

  const sources = [source];
  const ocr = sanitizeText(ocrText.trim());
  if (ocr && ocr !== source) sources.push(ocr);

  const findings = [
    ...findSmoothedBrokenWords(geminiText || source, ocr),
    ...sources.flatMap((text) =>
      spellcheck(text, {
        allow,
        skipLineIndices: detectRomanUrduLines(text),
      }),
    ),
  ];
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

    const lookupWord = f.suggestions[0] ?? f.word.replace(/\s+/g, "");
    const location = locateWord(lookupWord, locationContext) ?? locateWord(f.word, locationContext);
    newIssues.push({
      category: "typography",
      severity: f.severity,
      title: f.word.includes(" ")
        ? `Visible typo "${f.word}"`
        : `Misspelled "${f.word}"${f.count > 1 ? ` (×${f.count})` : ""}`,
      description: f.context
        ? `Found in: "${f.context}"`
        : `Appears ${f.count}× in the artwork.`,
      suggestion:
        f.suggestions.length > 0
          ? `Did you mean: ${f.suggestions.join(", ")}?`
          : "Verify the intended spelling.",
      location: location ?? null,
    });
  }

  if (!newIssues.length) return;

  report.issues = [...report.issues, ...newIssues];
}

interface PreviewMeta {
  pages: Array<{ url: string; width: number; height: number }>;
}

interface StorePreviewsArgs {
  bucket: string;
  assetId: string;
  version: number;
  orgId: string | null;
  isPdf: boolean;
  bytes: Buffer;
  /** The already-normalized page-1 image (used for analysis). */
  page1: { buffer: Buffer; mimeType: string; width: number; height: number };
}

/**
 * Persist preview thumbnails for an asset version.
 * - PDF: render every page, upload each, return a per-page manifest.
 * - Image: reuse the single normalized buffer already used for analysis.
 */
async function storePreviews(admin: any, args: StorePreviewsArgs): Promise<PreviewMeta | null> {
  const { bucket, assetId, version, orgId, isPdf, bytes, page1 } = args;
  const prefix = `${orgId ?? "external"}/assets/${assetId}/v${version}/previews`;
  const pages: PreviewMeta["pages"] = [];

  const renderPage = async (buf: Buffer, idx: number) => {
    const norm = await normalizeImage(buf);
    const path = `${prefix}/page_${idx}.${norm.mimeType === "image/png" ? "png" : "jpeg"}`;
    const { error } = await admin.storage.from(bucket).upload(path, norm.buffer, {
      contentType: norm.mimeType,
      upsert: true,
    });
    if (error) {
      console.error(`[proof] preview upload page ${idx} for v${version}: ${error.message}`);
      return null;
    }
    const { data: urlData } = admin.storage.from(bucket).getPublicUrl(path);
    return { url: urlData?.publicUrl ?? "", width: norm.width, height: norm.height };
  };

  try {
    if (isPdf) {
      const pagesBuf = await renderPdfAllPages(bytes);
      for (let i = 0; i < pagesBuf.length; i++) {
        const p = i === 0 ? await renderPage(page1.buffer, i) : await renderPage(pagesBuf[i], i);
        if (p) pages.push(p);
      }
    } else {
      const p = await renderPage(page1.buffer, 0);
      if (p) pages.push(p);
    }
    return pages.length ? { pages } : null;
  } catch (err) {
    console.error(`[proof] preview generation failed: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}
