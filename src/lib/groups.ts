import { createClient } from "@/lib/supabase/server";
import type { Group } from "@/types";
import type { GroupCard, ReportRow } from "./groups-presentation";
export type { GroupCard, ReportRow };
export { PLATFORM_LABEL, platformColor, platformIcon, timeAgo } from "./groups-presentation";

/**
 * Fetch the org's groups together with each group's latest proofreading
 * reports (thumbnails, issue counts, timestamps) plus org stats.
 */
export async function getDashboardData() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, organizations(name)")
    .eq("id", user.id)
    .maybeSingle();

  const orgId = profile?.org_id as string | undefined;
  const orgName =
    Array.isArray(profile?.organizations) && profile.organizations.length
      ? (profile.organizations as { name: string }[])[0].name
      : "My workspace";

  const { data: groups } = await supabase
    .from("groups")
    .select("id, name, platform, external_id, created_at")
    .eq("platform", "whatsapp")
    .like("external_id", "%@g.us")
    .order("created_at", { ascending: true });

  const { data: assets } = await supabase
    .from("assets")
    .select("id, name, kind, status, created_at, slug, group_id")
    .order("created_at", { ascending: false })
    .limit(300);

  const assetIds = (assets ?? []).map((a) => a.id);
  const { data: versions } = assetIds.length
    ? await supabase
        .from("asset_versions")
        .select("id, asset_id, version, url, preview_url")
        .in("asset_id", assetIds)
    : { data: null };

  const versionByAsset = new Map<string, { id: string; url: string | null; preview_url: string | null }>();
  for (const v of versions ?? []) {
    versionByAsset.set(v.asset_id, v);
  }

  const versionIds = (versions ?? []).map((v) => v.id);
  const { data: proofs } = versionIds.length
    ? await supabase.from("proofs").select("id, asset_version_id, score, status").in("asset_version_id", versionIds)
    : { data: null };

  const proofByVersion = new Map<string, { id: string; score: number; status: string }>();
  for (const p of proofs ?? []) proofByVersion.set(p.asset_version_id, p);

  const proofIds = (proofs ?? []).map((p) => p.id);
  const { data: issues } = proofIds.length
    ? await supabase.from("proof_issues").select("proof_id").in("proof_id", proofIds)
    : { data: null };

  const issueByProof = new Map<string, number>();
  for (const i of issues ?? []) {
    issueByProof.set(i.proof_id, (issueByProof.get(i.proof_id) ?? 0) + 1);
  }

  const byGroup = new Map<string, Group>();
  for (const g of groups ?? []) byGroup.set(g.id, g as Group);

  const groupMap = new Map<string, GroupCard>();
  for (const a of assets ?? []) {
    const gid = a.group_id;
    if (!gid || !byGroup.has(gid)) continue;
    const v = versionByAsset.get(a.id);
    const proof = v ? proofByVersion.get(v.id) : undefined;
    const row: ReportRow = {
      assetId: a.id,
      name: a.name,
      kind: a.kind,
      thumbnail: a.kind === "pdf" ? v?.preview_url ?? null : v?.url ?? null,
      issueCount: proof ? issueByProof.get(proof.id) ?? 0 : 0,
      score: proof?.score ?? null,
      status: a.status,
      createdAt: a.created_at,
      slug: a.slug,
      groupId: gid,
    };
    const card = groupMap.get(gid) ?? { group: byGroup.get(gid)!, reports: [] };
    card.reports.push(row);
    groupMap.set(gid, card);
  }

  for (const card of groupMap.values()) {
    card.reports.sort(
      (b, a) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  }

  const allReports = [...groupMap.values()].flatMap((c) => c.reports);
  const stats = {
    groups: groupMap.size,
    reports: allReports.length,
    filesChecked: allReports.filter((r) => r.score != null).length,
    issues: allReports.reduce((n, r) => n + r.issueCount, 0),
  };

  const cards = [...groupMap.values()].sort((a, b) => {
    const ra = a.reports[0]?.createdAt ?? "";
    const rb = b.reports[0]?.createdAt ?? "";
    return rb.localeCompare(ra) || a.group.name.localeCompare(b.group.name);
  });

  // Fetch pending and used WhatsApp auth codes for the org (for the
  // dashboard sidebar).
  const { data: authCodes } = orgId
    ? await supabase
        .from("whatsapp_group_auth_codes")
        .select("id, code, status, expires_at, claimed_at, group_jid, group_name, created_at")
        .eq("org_id", orgId)
    : { data: null };

  const codes = (authCodes ?? []).map((c) => {
    const now = new Date().toISOString();
    const isExpired = c.expires_at != null && c.expires_at < now;
    return {
      id: c.id,
      code: c.code,
      status: c.status,
      isExpired,
      expiresAt: c.expires_at ?? null,
      groupJid: c.group_jid ?? null,
      groupName: c.group_name ?? null,
      createdAt: c.created_at ?? null,
      usedAt: c.claimed_at ?? null,
    };
  });

  return { orgId, orgName, cards, stats, codes };
}
