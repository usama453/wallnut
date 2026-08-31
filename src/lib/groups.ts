import { createAdminClient, createClient } from "@/lib/supabase/server";
import type { Group } from "@/types";
import type { GroupCard, ReportRow } from "./groups-presentation";
import {
  displayGroupName,
  displayWhatsAppSender,
  isWhatsAppDirectChat,
} from "./groups-presentation";
import { isPublicOrgSlug } from "@/lib/org-paths";
import { reportDisplayName, type SummaryIssue } from "@/lib/reportSummary";
import {
  codeFromPendingExternalId,
  ensurePlaceholderWhatsAppGroups,
  isPendingGroupExternalId,
} from "@/lib/whatsapp/placeholder-groups";
import { fetchWahaContactName } from "@/lib/whatsapp/client";
import {
  loadOrgWhatsAppContacts,
  rememberWhatsAppContact,
} from "@/lib/whatsapp/contacts";
import { phoneDigits } from "@/lib/whatsapp/jid";
export type { GroupCard, ReportRow, PendingWhatsAppInvite } from "./groups-presentation";
export {
  PLATFORM_LABEL,
  displayGroupName,
  groupLinkLabel,
  isDirectMessagesBucket,
  isWhatsAppDirectChat,
  isWhatsAppGroupChat,
  platformColor,
  platformIcon,
  timeAgo,
} from "./groups-presentation";

/**
 * Fetch the org's groups together with each group's latest proofreading
 * reports (thumbnails, issue counts, timestamps) plus org stats.
 */
export async function getDashboardData(orgIdOverride?: string, isGuest = false) {
  const supabaseUser = await createClient();
  const {
    data: { user },
  } = await supabaseUser.auth.getUser();
  if (!user && !isGuest) return null;
  if (isGuest && !orgIdOverride) return null;

  const supabase = isGuest ? await createAdminClient() : supabaseUser;

  const { data: profile } = user
    ? await supabaseUser
        .from("profiles")
        .select("org_id, organizations(name, slug)")
        .eq("id", user.id)
        .maybeSingle()
    : { data: null };

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
  const { data: issueRows } = proofIds.length
    ? await supabase
        .from("proof_issues")
        .select("proof_id, category, severity, title, description, suggestion")
        .in("proof_id", proofIds)
    : { data: null };

  const issuesByProof = new Map<string, SummaryIssue[]>();
  const issueByProof = new Map<string, number>();
  for (const row of issueRows ?? []) {
    const list = issuesByProof.get(row.proof_id) ?? [];
    list.push({
      category: row.category,
      severity: row.severity,
      title: row.title,
      description: row.description,
      suggestion: row.suggestion,
    });
    issuesByProof.set(row.proof_id, list);
    issueByProof.set(row.proof_id, (issueByProof.get(row.proof_id) ?? 0) + 1);
  }

  const visibleGroups = (groups ?? []).filter((group) => {
    if (group.platform !== "whatsapp") return true;
    const externalId = group.external_id ?? "";
    if (group.name === "General" || isPendingGroupExternalId(externalId)) {
      return true;
    }
    if (!externalId) return false;
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

  const contactNames = await loadContactNamesForDashboard(
    orgId,
    visibleGroups,
    phoneByAsset,
  );

  const groupMap = new Map<string, GroupCard>();
  for (const group of byGroup.values()) {
    const digits = phoneDigits(group.external_id ?? "");
    groupMap.set(group.id, {
      group,
      reports: [],
      inviteCode: codeFromPendingExternalId(group.external_id) ?? undefined,
      contactName: digits ? contactNames.get(digits) : undefined,
    });
  }

  for (const a of assets ?? []) {
    const gid = a.group_id;
    if (!gid || !byGroup.has(gid)) continue;
    const v = versionByAsset.get(a.id);
    const proof = v ? proofByVersion.get(v.id) : undefined;
    const row: ReportRow = {
      assetId: a.id,
      name: proof
        ? reportDisplayName(a.name, issuesByProof.get(proof.id) ?? [])
        : a.name,
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
        displayWhatsAppSender(
          phoneByAsset.get(a.id),
          contactNames,
          isPublicOrgSlug(orgSlug) ? { withPhone: true } : undefined,
        ) ??
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
      if (isPublicOrgSlug(orgSlug)) {
        if (
          isWhatsAppDirectChat(externalId) &&
          card.reports.length === 0
        ) {
          return false;
        }
        return true;
      }
      if (
        card.group.name === "General" ||
        isPendingGroupExternalId(externalId) ||
        externalId.endsWith("@g.us")
      ) {
        return true;
      }
      if (!externalId) return card.reports.length > 0;
      return card.reports.length > 0;
    })
    .sort((a, b) => {
      const ra = a.reports[0]?.createdAt ?? "";
      const rb = b.reports[0]?.createdAt ?? "";
      return (
        rb.localeCompare(ra)
        || displayGroupName(a.group).localeCompare(displayGroupName(b.group))
      );
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

function looksLikePhoneLabel(label: string): boolean {
  const trimmed = label.trim();
  if (!trimmed) return false;
  return /^[+\d\s().-]+$/.test(trimmed) || phoneDigits(trimmed).length >= 8;
}

function buildContactNameMap(
  rows: Array<{ phone: string; display_name: string | null }>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    const digits = phoneDigits(row.phone);
    const name = row.display_name?.trim();
    if (digits && name) map.set(digits, name);
  }
  return map;
}

async function loadContactNamesForDashboard(
  orgId: string | undefined,
  groups: Array<Pick<Group, "external_id">>,
  phoneByAsset: Map<string, string>,
): Promise<Map<string, string>> {
  if (!orgId) return new Map();

  const wanted = new Set<string>();
  for (const group of groups) {
    const digits = phoneDigits(group.external_id ?? "");
    if (digits) wanted.add(digits);
  }
  for (const phone of phoneByAsset.values()) {
    const digits = phoneDigits(phone);
    if (digits) wanted.add(digits);
  }
  if (wanted.size === 0) return new Map();

  const contactNames = buildContactNameMap(await loadOrgWhatsAppContacts(orgId));

  const missing = [...wanted].filter((digits) => {
    const saved = contactNames.get(digits);
    return !saved || looksLikePhoneLabel(saved);
  });
  if (missing.length === 0) return contactNames;

  void (async () => {
    const live = await Promise.all(
      missing.slice(0, 8).map(async (digits) => {
        const name = await fetchWahaContactName(digits);
        return [digits, name] as const;
      }),
    );
    for (const [digits, name] of live) {
      if (!name || looksLikePhoneLabel(name)) continue;
      rememberWhatsAppContact({
        orgId,
        phone: digits,
        displayName: name,
      });
    }
  })();

  return contactNames;
}

/** Load saved WhatsApp display names for a set of phone/JID strings. */
export async function loadWhatsAppContactNamesForPhones(
  orgId: string | undefined,
  phones: Iterable<string>,
): Promise<Map<string, string>> {
  const phoneByAsset = new Map<string, string>();
  for (const phone of phones) {
    const trimmed = phone?.trim();
    if (trimmed) phoneByAsset.set(trimmed, trimmed);
  }
  return loadContactNamesForDashboard(orgId, [], phoneByAsset);
}
