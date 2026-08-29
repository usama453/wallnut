import type { Group, GroupPlatform } from "@/types";
import { phoneDigits } from "@/lib/whatsapp/jid";

export interface ReportRow {
  assetId: string;
  name: string;
  kind: "image" | "pdf";
  thumbnail: string | null;
  issueCount: number;
  score: number | null;
  status: string;
  createdAt: string;
  slug: string | null;
  groupId: string;
  uploader: string | null;
}

export interface GroupCard {
  group: Group;
  reports: ReportRow[];
  inviteCode?: string;
}

export interface PendingWhatsAppInvite {
  id: string;
  code: string;
  name?: string;
  expiresAt: string | null;
  createdAt: string | null;
}

export const PLATFORM_LABEL: Record<GroupPlatform, string> = {
  whatsapp: "WhatsApp",
  slack: "Slack",
  teams: "Microsoft Teams",
};

export function platformColor(platform: GroupPlatform): string {
  switch (platform) {
    case "whatsapp":
      return "#25D366";
    case "slack":
      return "#E01E5A";
    case "teams":
      return "#6264A7";
  }
}

export function platformIcon(platform: GroupPlatform): string {
  switch (platform) {
    case "whatsapp":
      return "WA";
    case "slack":
      return "SL";
    case "teams":
      return "MS";
  }
}

export function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** True for linked WhatsApp group chats (@g.us), not 1:1 DMs. */
export function isWhatsAppGroupChat(externalId?: string | null): boolean {
  if (!externalId) return false;
  const value = externalId.trim();
  if (value.endsWith("@g.us")) return true;
  return !value.includes("@") && value.includes("-");
}

/** True for WhatsApp 1:1 chats. */
export function isWhatsAppDirectChat(externalId?: string | null): boolean {
  if (!externalId) return false;
  return (
    externalId.endsWith("@c.us") ||
    externalId.endsWith("@s.whatsapp.net") ||
    externalId.endsWith("@lid")
  );
}

/** Legacy catch-all row where orphan / DM proofs were stored per org. */
export function isDirectMessagesBucket(
  group: Pick<Group, "name" | "platform" | "external_id">,
): boolean {
  return group.platform === "whatsapp" && group.name === "General" && !isWhatsAppGroupChat(group.external_id);
}

function looksLikeMessageText(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return true;
  if (trimmed.startsWith("@")) return true;
  if (trimmed.length > 48) return true;
  if (/\?/.test(trimmed) && trimmed.split(/\s+/).length > 3) return true;
  return false;
}

/** Empty WhatsApp group rows with no proofs — stray metadata, safe to hide. */
export function isStaleEmptyWhatsAppGroup(
  group: Pick<Group, "name" | "platform" | "external_id">,
  reportCount: number,
  inviteCode?: string,
  options?: { publicOrg?: boolean },
): boolean {
  if (group.platform !== "whatsapp" || reportCount > 0 || inviteCode) return false;
  if (isDirectMessagesBucket(group) || isWhatsAppDirectChat(group.external_id)) {
    return false;
  }
  const externalId = group.external_id ?? "";
  if (externalId.startsWith("pending:")) return false;
  if (externalId.endsWith("@g.us")) {
    return options?.publicOrg === true || looksLikeMessageText(group.name);
  }
  return looksLikeMessageText(group.name);
}

/** Human label for dashboard / group headers. */
export function displayGroupName(
  group: Pick<Group, "name" | "platform" | "external_id">,
): string {
  if (group.platform !== "whatsapp") return group.name;
  if (isDirectMessagesBucket(group)) return "Direct messages";
  if (isWhatsAppDirectChat(group.external_id)) {
    if (!looksLikeMessageText(group.name)) return group.name;
    const digits = phoneDigits(group.external_id);
    return digits ? `Direct message · +${digits}` : "Direct message";
  }
  if (!group.external_id && looksLikeMessageText(group.name)) {
    return "Direct messages";
  }
  return group.name;
}

export function groupLinkLabel(
  group: Pick<Group, "name" | "platform" | "external_id">,
): string {
  if (isDirectMessagesBucket(group) || isWhatsAppDirectChat(group.external_id)) {
    return "View";
  }
  return "Open Group";
}

export function isPublicDirectMessageCard(
  group: Pick<Group, "name" | "platform" | "external_id">,
): boolean {
  return isDirectMessagesBucket(group) || isWhatsAppDirectChat(group.external_id);
}

export function isPublicUnlinkedGroupCard(
  group: Pick<Group, "name" | "platform" | "external_id">,
): boolean {
  if (group.platform !== "whatsapp") return true;
  return !isPublicDirectMessageCard(group);
}

/** Split Public org dashboard cards into inbox vs unlinked group buckets. */
export function categorizePublicCards(cards: GroupCard[]): {
  directMessages: GroupCard[];
  unlinkedGroups: GroupCard[];
} {
  const directMessages: GroupCard[] = [];
  const unlinkedGroups: GroupCard[] = [];
  for (const card of cards) {
    if (isPublicDirectMessageCard(card.group)) {
      directMessages.push(card);
    } else {
      unlinkedGroups.push(card);
    }
  }
  directMessages.sort((a, b) => {
    if (isDirectMessagesBucket(a.group)) return -1;
    if (isDirectMessagesBucket(b.group)) return 1;
    const ra = a.reports[0]?.createdAt ?? "";
    const rb = b.reports[0]?.createdAt ?? "";
    return rb.localeCompare(ra) || displayGroupName(a.group).localeCompare(displayGroupName(b.group));
  });
  unlinkedGroups.sort((a, b) => {
    const ra = a.reports[0]?.createdAt ?? "";
    const rb = b.reports[0]?.createdAt ?? "";
    return rb.localeCompare(ra) || displayGroupName(a.group).localeCompare(displayGroupName(b.group));
  });
  return { directMessages, unlinkedGroups };
}

/** Cleaner label for orphan WhatsApp groups on the Public workspace. */
export function displayPublicUnlinkedGroupName(
  group: Pick<Group, "name" | "platform" | "external_id">,
): string {
  if (group.platform !== "whatsapp") return group.name;
  if (isPendingGroupExternalId(group.external_id)) {
    return group.name?.trim() || "Pending WhatsApp group";
  }
  if (looksLikeMessageText(group.name)) {
    const jid = (group.external_id ?? "").replace(/@g\.us$/i, "");
    const suffix = jid ? jid.slice(-8) : "unknown";
    return `Unlinked group · …${suffix}`;
  }
  return group.name;
}

function isPendingGroupExternalId(externalId?: string | null): boolean {
  return Boolean(externalId?.startsWith("pending:"));
}

/** Stable label when creating a WhatsApp 1:1 group row. */
export function directMessageGroupName(from: string, pushName?: string | null): string {
  const cleanPush = pushName?.trim();
  if (cleanPush && !looksLikeMessageText(cleanPush) && cleanPush.split(/\s+/).length <= 4) {
    return cleanPush;
  }
  const digits = phoneDigits(from);
  return digits ? `+${digits}` : "Direct message";
}
