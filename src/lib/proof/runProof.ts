import { createAdminClient } from "@/lib/supabase/server";
import { normalizeImage } from "@/lib/image";
import { renderPdfAllPages } from "@/lib/pdf";
import { getProvider } from "@/lib/ai";
import { getProofAdminSettings } from "./proof-settings-store";
import type { ProofChecksConfig } from "./proof-settings";
import { isAllGoodDirectResponse, sanitizeDirectProofResponse } from "@/lib/proof/direct-response";
import { sanitizeText } from "@/lib/text";
import type { RawReport } from "@/lib/ai";

export const BUCKET = "artifacts";

export interface RunProofResult {
  proofId: string;
  report: RawReport;
  ocrText: string;
  model: string;
  ocrConfidence: number;
  pipelineMode: "gemini_only";
}

/**
 * Direct Gemini proof for a stored version:
 * 1. load bytes from storage   2. rasterize PDF if needed
 * 3. normalize image           4. one Gemini prompt
 * 5. persist proof
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

  const { data: file, error: fErr } = await admin.storage
    .from(BUCKET)
    .download(version.storage_path);
  if (fErr || !file) throw new Error("failed to load file from storage");
  const bytes = Buffer.from(await file.arrayBuffer());

  let image: { buffer: Buffer; mimeType: string } = { buffer: bytes, mimeType: asset.mime };
  if (asset.kind === "pdf") {
    const page = await renderPdfAllPages(bytes);
    image = { buffer: page[0], mimeType: "image/png" };
  }
  const normalized = await normalizeImage(image.buffer);

  const previewMeta = await storePreviews(admin, {
    bucket: BUCKET,
    assetId: asset.id,
    version: version.version,
    orgId: asset.org_id,
    isPdf: asset.kind === "pdf",
    bytes,
    page1: {
      buffer: normalized.buffer,
      mimeType: normalized.mimeType,
      width: normalized.width,
      height: normalized.height,
    },
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

  const proofSettings = await getProofAdminSettings(asset.org_id);
  const provider = getProvider();
  const { rawText } = await provider.proofAssetDirect({
    imageBase64: normalized.base64,
    mimeType: normalized.mimeType,
  });
  const directResponse = sanitizeDirectProofResponse(sanitizeText(rawText.trim()));
  const allGood = isAllGoodDirectResponse(directResponse);
  const report: RawReport = {
    score: allGood ? 100 : 70,
    status: allGood ? "passed" : "needs_review",
    summary: directResponse,
    issues: [],
    directResponse,
    humanReply: directResponse,
  };

  const proofId = await persistProof(admin, {
    assetVersionId,
    assetId: asset.id,
    report,
    model: `${provider.name} · direct`,
    enabledChecks: proofSettings.checks,
  });

  return {
    proofId,
    report,
    ocrText: "",
    model: `${provider.name} · direct`,
    ocrConfidence: 0,
    pipelineMode: "gemini_only",
  };
}

async function persistProof(
  admin: any,
  args: {
    assetVersionId: string;
    assetId: string;
    report: RawReport;
    model: string;
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
      ocr_text: "",
      model: args.model,
      raw: {
        ...args.report,
        pipeline_mode: "gemini_only",
        enabled_checks: args.enabledChecks,
      },
    })
    .select("id")
    .single();
  if (error || !proof) throw new Error(`failed to save proof: ${error?.message}`);

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
  page1: { buffer: Buffer; mimeType: string; width: number; height: number };
}

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
