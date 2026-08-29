import { createClient } from "@/lib/supabase/server";

export interface PersonStats {
  key: string;
  phone: string | null;
  display: string;
  uploads: number;
  typos: number;
  avgScore: number | null;
}

/**
 * Per-phone leaderboard stats across the org's WhatsApp proofing activity.
 *
 * Attribution chain:
 *   whatsapp_usage (from_phone, asset_id, msg_type='proof')
 *     → assets → asset_versions → proofs → proof_issues
 *
 * Uploads + typos are counted for every distinct phone that sent a design in
 * for proofing. Assets not tied to a phone are grouped under "Dashboard".
 */
export async function getStats() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("organizations(name, slug)")
    .eq("id", user.id)
    .maybeSingle();
  const organization = Array.isArray(profile?.organizations)
    ? profile.organizations[0] ?? null
    : profile?.organizations ?? null;

  // Proofing activity, org-scoped via RLS.
  const { data: usage } = await supabase
    .from("whatsapp_usage")
    .select("from_phone, asset_id, status")
    .eq("direction", "inbound")
    .eq("msg_type", "proof")
    .not("asset_id", "is", null)
    .limit(500);

  const usageRows = usage ?? [];

  const assetIds = [...new Set(usageRows.map((u) => u.asset_id as string))];
  const { data: versions } = assetIds.length
    ? await supabase
        .from("asset_versions")
        .select("id, asset_id, version")
        .in("asset_id", assetIds)
        .order("version", { ascending: false })
    : { data: null };

  // Latest version id per asset (highest version).
  const versionByAsset = new Map<string, string>();
  for (const v of versions ?? []) {
    if (!versionByAsset.has(v.asset_id)) versionByAsset.set(v.asset_id, v.id);
  }
  const versionIds = [...versionByAsset.values()];

  const { data: proofs } = versionIds.length
    ? await supabase.from("proofs").select("id, asset_version_id, score").in("asset_version_id", versionIds)
    : { data: null };
  const proofByVersion = new Map<string, { id: string; score: number }>();
  for (const p of proofs ?? []) proofByVersion.set(p.asset_version_id, p);

  const proofIds = (proofs ?? []).map((p) => p.id);
  const { data: issues } = proofIds.length
    ? await supabase.from("proof_issues").select("proof_id").in("proof_id", proofIds)
    : { data: null };
  const issueByProof = new Map<string, number>();
  for (const i of issues ?? []) issueByProof.set(i.proof_id, (issueByProof.get(i.proof_id) ?? 0) + 1);

  const byPerson = new Map<string, PersonStats>();

  for (const u of usageRows) {
    const assetId = u.asset_id as string;
    const versionId = versionByAsset.get(assetId);
    const proof = versionId ? proofByVersion.get(versionId) : undefined;
    const phone = (u.from_phone as string | null) ?? null;
    const key = phone ?? "__dashboard__";

    const entry =
      byPerson.get(key) ??
      {
        key,
        phone,
        display: phone ? formatPhone(phone) : "Dashboard",
        uploads: 0,
        typos: 0,
        avgScore: null as number | null,
      };

    entry.uploads += 1;
    if (proof) {
      entry.typos += issueByProof.get(proof.id) ?? 0;
      const prev = entry.avgScore ?? proof.score;
      entry.avgScore = Math.round((prev * (entry.uploads - 1) + proof.score) / entry.uploads);
    }
    byPerson.set(key, entry);
  }

  const people = [...byPerson.values()];

  const byUploads = [...people].sort((a, b) => b.uploads - a.uploads || b.typos - a.typos);
  const byTypos = [...people].sort((a, b) => b.typos - a.typos || a.uploads - b.uploads);

  return {
    orgName: organization?.name ?? "My workspace",
    orgSlug: organization?.slug ?? null,
    byUploads,
    byTypos,
    totals: {
      uploads: people.reduce((n, p) => n + p.uploads, 0),
      typos: people.reduce((n, p) => n + p.typos, 0),
      people: people.filter((p) => p.phone).length,
      checked: proofs?.length ?? 0,
      avgScore:
        proofs?.length
          ? Math.round(
              proofs.reduce((sum, proof) => sum + proof.score, 0) /
                proofs.length,
            )
          : null,
    },
  };
}

function formatPhone(raw: string): string {
  const s = raw.replace(/\D/g, "");
  if (s.length === 12) return `+${s.slice(0, 2)} ${s.slice(2, 5)} ${s.slice(5, 8)} ${s.slice(8)}`;
  if (s.length === 11) return `+${s[0]} ${s.slice(1, 4)} ${s.slice(4, 7)} ${s.slice(7)}`;
  if (s.length === 10) return `${s.slice(0, 3)} ${s.slice(3, 6)} ${s.slice(6)}`;
  return raw;
}
