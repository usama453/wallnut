import { createClient } from "@/lib/supabase/server";
import type { Group } from "@/types";
import type { GroupCard, ReportRow } from "./groups-presentation";
import {
  codeFromPendingExternalId,
  ensurePlaceholderWhatsAppGroups,
  isPendingGroupExternalId,
} from "@/lib/whatsapp/placeholder-groups";
export type { GroupCard, ReportRow, PendingWhatsAppInvite } from "./groups-presentation";
export { PLATFORM_LABEL, platformColor, platformIcon, timeAgo } from "./groups-presentation";

/**
 * Fetch the org's groups together with each group's latest proofreading
 * reports (thumbnails, issue counts, timestamps) plus org stats.
 */
export async function getDashboardData(orgIdOverride?: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, organizations(name, slug)")
    .eq("id", user.id)
    .maybeSingle();

  const orgId = orgIdOverride ?? (profile?.org_id as string | undefined);
  if (orgId) await ensurePlaceholderWhatsAppGroups(orgId);
  const { data: orgRow } = orgId
    ? await supabase
        .from("organizations")
        .select("name, slug")
        .eq("id", orgId)
        .maybeSingle()
    : { data: null };
  const organization = orgRow
    ?? (Array.isArray(profile?.organizations)
      ? (profile.organizations[0] as { name?: string; slug?: string } | undefined)
      : (profile?.organizations as { name?: string; slug?: string } | null | undefined));
  const orgName = organization?.name ?? "My workspace";
  const orgSlug = organization?.slug ?? null;

  const { count: memberCount } = orgId
    ? await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
    : { count: 0 };

  // Communication groups are org-scoped via RLS. Include empty groups so a
  // newly connected workspace does not disappear from the dashboard.
  const { data: groups } = orgId
    ? await supabase
        .from("groups")
        .select("id, org_id, name, platform, external_id, created_at")
        .eq("org_id", orgId)
        .order("created_at", { ascending: true })
    : { data: null };

  const { data: assets } = orgId
    ? await supabase
        .from("assets")
        .select("id, name, kind, status, created_at, created_by, slug, group_id")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(300)
    : { data: null };

  const assetIds = (assets ?? []).map((a) => a.id);
  const { data: versions } = assetIds.length
    ? await supabase
        .from("asset_versions")
        .select("id, asset_id, version, url, preview_url")
        .in("asset_id", assetIds)
        .order("version", { ascending: false })
    : { data: null };

  const versionByAsset = new Map<string, { id: string; url: string | null; preview_url: string | null }>();
  for (const v of versions ?? []) {
    if (!versionByAsset.has(v.asset_id)) versionByAsset.set(v.asset_id, v);
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

  const visibleGroups = (groups ?? []).filter((group) => {
    if (group.platform !== "whatsapp") return true;
    const externalId = group.external_id ?? "";
    if (!externalId || group.name === "General" || isPendingGroupExternalId(externalId)) {
      return true;
    }
    if (externalId.endsWith("@g.us")) return true;
    // Direct 1:1 chats with Wallnut belong on Public.
    return (
      externalId.endsWith("@c.us") ||
      externalId.endsWith("@s.whatsapp.net") ||
      externalId.endsWith("@lid")
    );
  });
  const byGroup = new Map<string, Group>();
  for (const g of visibleGroups) byGroup.set(g.id, g as Group);

  const creatorIds = [
    ...new Set(
      (assets ?? [])
        .map((asset) => asset.created_by as string | null)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const [{ data: creators }, { data: usageUploaders }] = await Promise.all([
    creatorIds.length
      ? supabase.from("profiles").select("id, full_name").in("id", creatorIds)
      : Promise.resolve({ data: null }),
    assetIds.length
      ? supabase
          .from("whatsapp_usage")
          .select("asset_id, from_phone")
          .in("asset_id", assetIds)
          .eq("direction", "inbound")
          .eq("msg_type", "proof")
      : Promise.resolve({ data: null }),
  ]);
  const creatorName = new Map<string, string>();
  for (const creator of creators ?? []) {
    creatorName.set(creator.id, creator.full_name || "Workspace member");
  }
  const phoneByAsset = new Map<string, string>();
  for (const usage of usageUploaders ?? []) {
    if (usage.asset_id && usage.from_phone && !phoneByAsset.has(usage.asset_id)) {
      phoneByAsset.set(usage.asset_id, usage.from_phone);
    }
  }

  const groupMap = new Map<string, GroupCard>();
  for (const group of byGroup.values()) {
    groupMap.set(group.id, {
      group,
      reports: [],
      inviteCode: codeFromPendingExternalId(group.external_id) ?? undefined,
    });
  }

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
      uploader:
        (a.created_by ? creatorName.get(a.created_by) : null) ??
        phoneByAsset.get(a.id) ??
        null,
    };
    const card = groupMap.get(gid)!;
    card.reports.push(row);
  }

  for (const card of groupMap.values()) {
    card.reports.sort(
      (b, a) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  }

  const cards = [...groupMap.values()]
    .filter((card) => {
      const externalId = card.group.external_id ?? "";
      if (
        !externalId ||
        card.group.name === "General" ||
        isPendingGroupExternalId(externalId) ||
        externalId.endsWith("@g.us")
      ) {
        return true;
      }
      return card.reports.length > 0;
    })
    .sort((a, b) => {
      const ra = a.reports[0]?.createdAt ?? "";
      const rb = b.reports[0]?.createdAt ?? "";
      return rb.localeCompare(ra) || a.group.name.localeCompare(b.group.name);
    });

  const allReports = cards.flatMap((c) => c.reports);
  const stats = {
    groups: cards.length,
    reports: allReports.length,
    filesChecked: allReports.filter((r) => r.score != null).length,
    issues: allReports.reduce((n, r) => n + r.issueCount, 0),
    members: memberCount ?? 0,
  };

  // Fetch pending and used WhatsApp auth codes for the org (for the
  // dashboard sidebar).
  const { data: authCodes } = orgId
    ? await supabase
        .from("whatsapp_group_auth_codes")
        .select("id, code, status, expires_at, used_at, group_jid, group_name, created_at")
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
      usedAt: c.used_at ?? null,
    };
  });

  const pendingInvites = codes.filter(
    (code) =>
      code.status === "pending" &&
      !code.isExpired &&
      !cards.some((card) => card.inviteCode === code.code),
  );

  return { orgId, orgName, orgSlug, cards, stats, codes, pendingInvites };
}
