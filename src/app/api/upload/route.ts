import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { runProof, BUCKET } from "@/lib/proof/runProof";

export const runtime = "nodejs";
export const maxDuration = 60;

const ALLOWED_IMAGE_MIMES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/bmp", "image/avif"];
const ALLOWED_PDF_MIME = "application/pdf";
const MAX_BYTES = 20 * 1024 * 1024; // 20 MB

/**
 * POST /api/upload
 * multipart/form-data: file, name?, project_id?
 * Stores the file, creates an asset + version, runs the proof, returns results.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Admin client to bypass RLS for writes (org checks are done above).
  const { createAdminClient } = await import("@/lib/supabase/server");
  const admin = await createAdminClient();

  // Resolve the target org: the signed-in user's org, else the default workspace.
  let orgId: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("org_id, role")
      .eq("id", user.id)
      .single();
    orgId = profile?.org_id ?? null;
  }
  if (!orgId) {
    const { data: org } = await admin
      .from("organizations")
      .select("id")
      .eq("slug", "default")
      .single();
    orgId = org?.id ?? null;
  }
  if (!orgId) {
    return NextResponse.json({ error: "no workspace configured" }, { status: 500 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "no file provided" }, { status: 400 });
  }

  const mime = file.type;
  const isImage = ALLOWED_IMAGE_MIMES.includes(mime);
  const isPdf = mime === ALLOWED_PDF_MIME;
  if (!isImage && !isPdf) {
    return NextResponse.json(
      { error: `unsupported file type: ${mime}. Upload a PNG, JPEG, WebP, GIF, BMP, AVIF or PDF.` },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "file exceeds 20 MB limit" }, { status: 413 });
  }

  const name = (form.get("name") as string) || file.name || "Untitled artwork";
  const projectId = (form.get("project_id") as string) || null;

  const { data: asset, error: assetErr } = await admin
    .from("assets")
    .insert({
      org_id: orgId,
      project_id: projectId,
      name,
      kind: isPdf ? "pdf" : "image",
      mime,
      current_version: 1,
      status: "in_review",
      created_by: user?.id ?? null,
    })
    .select("id, org_id")
    .single();
  if (assetErr || !asset) {
    return NextResponse.json({ error: `failed to create asset: ${assetErr?.message}` }, { status: 500 });
  }

  const storagePath = `${asset.org_id}/assets/${asset.id}/v1/${randomUUID()}-${sanitize(file.name)}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await admin.storage.from(BUCKET).upload(storagePath, bytes, {
    contentType: mime,
    upsert: false,
  });
  if (upErr) {
    await admin.from("assets").delete().eq("id", asset.id);
    return NextResponse.json({ error: `failed to store file: ${upErr.message}` }, { status: 500 });
  }

  const { data: urlData } = admin.storage.from(BUCKET).getPublicUrl(storagePath);

  const { data: version, error: verErr } = await admin
    .from("asset_versions")
    .insert({
      asset_id: asset.id,
      version: 1,
      storage_path: storagePath,
      url: urlData?.publicUrl ?? storagePath,
      created_by: user?.id ?? null,
    })
    .select("id")
    .single();
  if (verErr || !version) {
    return NextResponse.json({ error: `failed to create version: ${verErr?.message}` }, { status: 500 });
  }

  // Run the proof pipeline.
  try {
    const proof = await runProof(version.id);
    return NextResponse.json({
      assetId: asset.id,
      versionId: version.id,
      proof: {
        id: proof.proofId,
        score: proof.report.score,
        status: proof.report.status,
        summary: proof.report.summary,
        issueCount: proof.report.issues.length,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "proof failed";
    return NextResponse.json(
      { error: `file stored but proof failed: ${message}`, assetId: asset.id },
      { status: 502 },
    );
  }
}

function sanitize(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}
