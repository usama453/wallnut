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

/** Stable label when creating a WhatsApp 1:1 group row. */
export function directMessageGroupName(from: string, pushName?: string | null): string {
  const cleanPush = pushName?.trim();
  if (cleanPush && !looksLikeMessageText(cleanPush) && cleanPush.split(/\s+/).length <= 4) {
    return cleanPush;
  }
  const digits = phoneDigits(from);
  return digits ? `+${digits}` : "Direct message";
}
