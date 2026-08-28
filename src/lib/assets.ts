import { createAdminClient } from "@/lib/supabase/server";
import { BUCKET } from "@/lib/proof/runProof";
import { randomBytes, randomUUID } from "crypto";

export interface CreatedAssetVersion {
  assetId: string;
  versionId: string;
  version: number;
  /** Short public slug used in shareable /r/<slug> report links. */
  slug: string;
}

/**
 * Create an asset + first version from raw bytes, store them in Supabase
 * Storage, and return the ids. Used by the web app upload route and the
 * WhatsApp handler so both follow the same path.
 */
export async function createAssetVersionFromBytes(args: {
  orgId: string | null;
  name: string;
  mime: string;
  kind: "image" | "pdf";
  bytes: Buffer;
  createdBy?: string | null;
  groupId?: string | null;
  lookupGroupId?: string | null;
}): Promise<CreatedAssetVersion> {
  const admin = await createAdminClient();

  // Resolve a group JID to a groups.id if a lookupGroupId was provided.
  let resolvedGroupId: string | null = args.groupId ?? null;
  if (args.lookupGroupId) {
    const { data: groupRow } = await admin
      .from("groups")
      .select("id")
      .eq("external_id", args.lookupGroupId)
      .eq("platform", "whatsapp")
      .maybeSingle();
    resolvedGroupId = groupRow?.id ?? null;
  }

  // Retry a few times on slug collisions (unique index on assets.slug).
  let asset: { id: string; org_id: string; slug: string } | null = null;
  let assetErr: Error | null = null;
  for (let attempt = 0; attempt < 4 && !asset; attempt++) {
    const res = await admin
      .from("assets")
      .insert({
        org_id: args.orgId,
        name: args.name,
        kind: args.kind,
        mime: args.mime,
        slug: generateSlug(),
        current_version: 1,
        status: "in_review",
        created_by: args.createdBy ?? null,
        group_id: resolvedGroupId,
      })
      .select("id, org_id, slug")
      .single();
    if (res.error?.code === "23505") continue; // slug collision → retry
    asset = res.data;
    assetErr = res.error;
  }
  if (assetErr || !asset) throw new Error(`failed to create asset: ${assetErr?.message}`);

  const storagePath = `${asset.org_id ?? "external"}/assets/${asset.id}/v1/${randomUUID()}-${sanitize(args.name)}`;
  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(storagePath, args.bytes, { contentType: args.mime, upsert: false });
  if (upErr) {
    await admin.from("assets").delete().eq("id", asset.id);
    throw new Error(`failed to store file: ${upErr.message}`);
  }

  const { data: urlData } = admin.storage.from(BUCKET).getPublicUrl(storagePath);

  const { data: version, error: verErr } = await admin
    .from("asset_versions")
    .insert({
      asset_id: asset.id,
      version: 1,
      storage_path: storagePath,
      url: urlData?.publicUrl ?? storagePath,
      created_by: args.createdBy ?? null,
    })
    .select("id, version")
    .single();
  if (verErr || !version) throw new Error(`failed to create version: ${verErr?.message}`);

  return {
    assetId: asset.id,
    versionId: version.id,
    version: version.version,
    slug: asset.slug,
  };
}

/** Short random lowercase alphanumeric slug for public report links. */
function generateSlug(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from(randomBytes(8), (b) => alphabet[b % alphabet.length]).join("");
}

function sanitize(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "asset";
}
