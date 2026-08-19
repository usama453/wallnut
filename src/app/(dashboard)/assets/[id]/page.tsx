import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { AssetViewer, type ViewerData } from "@/components/asset-viewer";

export default async function AssetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: asset } = await supabase
    .from("assets")
    .select("id, org_id, name, kind, mime, current_version, status, created_at, project_id")
    .eq("id", id)
    .maybeSingle();

  if (!asset) notFound();

  const { data: versions } = await supabase
    .from("asset_versions")
    .select("id, asset_id, storage_path, version, url, preview_url, width, height, created_at")
    .eq("asset_id", id)
    .order("version", { ascending: false });

  const { data: approvals } = await supabase
    .from("approvals")
    .select("id, asset_id, version, status, reviewer_id, comment, created_at")
    .eq("asset_id", id)
    .order("created_at", { ascending: false });

  const { data: comments } = await supabase
    .from("comments")
    .select("id, asset_id, author_id, body, resolved, created_at")
    .eq("asset_id", id)
    .order("created_at", { ascending: false });

  const { data: brand } = await supabase
    .from("brand_profiles")
    .select("id, company_name, colors, fonts, tone_of_voice, logo_url, preferred_terminology, banned_words, style_guide")
    .eq("org_id", asset.org_id)
    .maybeSingle();

  // fetch proofs + issues for every version
  const versionIds = (versions ?? []).map((v) => v.id);
  const { data: proofs } = versionIds.length
    ? await supabase.from("proofs").select("id, asset_version_id, score, status, summary, model, created_at").in("asset_version_id", versionIds)
    : { data: [] };

  const proofIds = (proofs ?? []).map((p) => p.id);
  const { data: issues } = proofIds.length
    ? await supabase.from("proof_issues").select("id, proof_id, category, severity, title, description, suggestion, x, y, w, h, status").in("proof_id", proofIds)
    : { data: [] };

  const viewerData = {
    asset: asset as any,
    versions: (versions ?? []).map((v) => {
      const proof = (proofs ?? []).find((p) => p.asset_version_id === v.id);
      return {
        ...v,
        proof: proof
          ? {
              ...proof,
              issues: (issues ?? []).filter((i) => i.proof_id === proof.id),
            }
          : null,
      };
    }) as ViewerData["versions"],
    approvals: (approvals ?? []) as any,
    comments: (comments ?? []) as any,
    brand: (brand ?? null) as any,
  } satisfies ViewerData;

  return (
    <div className="mx-auto max-w-6xl">
      <AssetViewer data={viewerData} />
    </div>
  );
}
