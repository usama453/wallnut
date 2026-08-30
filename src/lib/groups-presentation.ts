import type { Group, GroupPlatform } from "@/types";
import { phoneDigits } from "@/lib/whatsapp/jid";
import { isRomanUrduLine } from "@/lib/proof/roman-urdu";

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

export function reportAlertLabel(
  report: Pick<ReportRow, "status" | "score">,
): string | null {
  if (report.status === "changes_requested") return "Changes requested";
  if (report.score != null && report.score < 70) return "Errors";
  return null;
}

export interface GroupCard {
  group: Group;
  reports: ReportRow[];
  inviteCode?: string;
  /** Saved WhatsApp push / address-book name for 1:1 chats. */
  contactName?: string;
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
  if (trimmed.split(/\s+/).length >= 5) return true;
  if (isRomanUrduLine(trimmed)) return true;
  if (/\?/.test(trimmed) && trimmed.split(/\s+/).length > 3) return true;
  return false;
}

function looksLikePhoneLabel(label: string): boolean {
  const trimmed = label.trim();
  if (!trimmed) return false;
  if (/^[+\d\s().-]+$/.test(trimmed)) return true;
  return phoneDigits(trimmed).length >= 8;
}

/** Last four digits — enough to tell contacts apart without a full number. */
export function whatsAppContactHint(digits: string): string {
  if (!digits) return "";
  if (digits.length <= 4) return `···${digits}`;
  return `···${digits.slice(-4)}`;
}

/** Human-readable phone when we have no saved contact name. */
export function formatWhatsAppPhone(digits: string): string {
  if (!digits || digits.length < 4) return "WhatsApp contact";
  return `+${digits}`;
}

/** Human label for who sent a proof (never raw @lid JIDs). */
export function displayWhatsAppSender(
  raw: string | null | undefined,
  contactNames?: Map<string, string>,
  options?: { withPhone?: boolean },
): string | null {
  if (!raw?.trim()) return null;
  const digits = phoneDigits(raw);
  if (!digits) {
    return raw.includes("@") ? "WhatsApp contact" : raw.trim();
  }
  const phone = formatWhatsAppPhone(digits);
  const saved = contactNames?.get(digits);
  if (saved && !looksLikePhoneLabel(saved) && !looksLikeMessageText(saved)) {
    return options?.withPhone ? `${saved} · ${phone}` : saved;
  }
  return phone;
}

function privateChatPhoneLabel(digits: string): string | null {
  if (!digits) return null;
  const phone = formatWhatsAppPhone(digits);
  return phone === "WhatsApp contact" ? null : phone;
}

/** Stable label for a 1:1 WhatsApp contact — never show a full message as the title. */
export function displayPrivateChatTitle(
  group: Pick<Group, "name" | "platform" | "external_id">,
  contactName?: string | null,
): string {
  const digits = phoneDigits(group.external_id ?? "");
  const phone = privateChatPhoneLabel(digits);

  const savedName = contactName?.trim();
  if (
    savedName &&
    !looksLikeMessageText(savedName) &&
    !looksLikePhoneLabel(savedName)
  ) {
    return phone ? `${savedName} · ${phone}` : savedName;
  }

  const raw = group.name?.trim() ?? "";
  const shortName =
    raw &&
    !looksLikeMessageText(raw) &&
    !looksLikePhoneLabel(raw) &&
    raw.split(/\s+/).length <= 3 &&
    raw.length <= 32
      ? raw
      : null;

  if (shortName) {
    const nameDigits = phoneDigits(raw);
    if (nameDigits && digits && nameDigits === digits) {
      return phone ?? "WhatsApp contact";
    }
    return phone ? `${shortName} · ${phone}` : shortName;
  }

  return phone ?? "Private chat";
}

export function cardLastActiveAt(card: GroupCard): string | null {
  return card.reports[0]?.createdAt ?? card.group.created_at ?? null;
}

/** Human label for dashboard / group headers. */
export function displayGroupName(
  group: Pick<Group, "name" | "platform" | "external_id">,
): string {
  if (group.platform !== "whatsapp") return group.name;
  if (isDirectMessagesBucket(group)) return "Direct messages";
  if (isWhatsAppDirectChat(group.external_id)) {
    return displayPrivateChatTitle(group);
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

export interface PublicInboxSections {
  /** 1:1 chats that have sent at least one proof. */
  privateChats: GroupCard[];
  /** Legacy General bucket from before per-contact threads. */
  directArchive: GroupCard[];
  /** Unlinked @g.us groups that have sent proofs. */
  groupProofs: GroupCard[];
  /** Unlinked groups detected but with no proofed media yet. */
  idleGroups: GroupCard[];
}

function sortPublicCards(cards: GroupCard[]): GroupCard[] {
  return [...cards].sort((a, b) => {
    const ra = a.reports[0]?.createdAt ?? a.group.created_at ?? "";
    const rb = b.reports[0]?.createdAt ?? b.group.created_at ?? "";
    return rb.localeCompare(ra) || publicCardPresentation(a).title.localeCompare(publicCardPresentation(b).title);
  });
}

/** Categorise every Public inbox row by where the traffic came from. */
export function categorizePublicInbox(cards: GroupCard[]): PublicInboxSections {
  const privateChats: GroupCard[] = [];
  const directArchive: GroupCard[] = [];
  const groupProofs: GroupCard[] = [];
  const idleGroups: GroupCard[] = [];

  for (const card of cards) {
    const group = card.group;
    if (isDirectMessagesBucket(group)) {
      directArchive.push(card);
      continue;
    }
    if (isWhatsAppDirectChat(group.external_id)) {
      if (card.reports.length > 0) privateChats.push(card);
      continue;
    }
    if (card.inviteCode || isPendingGroupExternalId(group.external_id)) {
      idleGroups.push(card);
      continue;
    }
    if (card.reports.length > 0) {
      groupProofs.push(card);
    } else {
      idleGroups.push(card);
    }
  }

  return {
    privateChats: sortPublicCards(privateChats),
    directArchive: sortPublicCards(directArchive),
    groupProofs: sortPublicCards(groupProofs),
    idleGroups: sortPublicCards(idleGroups),
  };
}

export interface PublicCardPresentation {
  title: string;
  badge: string;
  hint: string;
  emptyMessage: string;
  lastActiveAt: string | null;
}

/** Source label shown on each Public dashboard card. */
export function publicCardPresentation(card: GroupCard): PublicCardPresentation {
  const group = card.group;
  const count = card.reports.length;
  const lastActiveAt = cardLastActiveAt(card);

  if (isDirectMessagesBucket(group)) {
    return {
      title: "Direct messages archive",
      badge: "Legacy inbox",
      hint: `${count} proof${count === 1 ? "" : "s"} from older private chats`,
      emptyMessage: "No archived direct-message proofs.",
      lastActiveAt,
    };
  }

  if (isWhatsAppDirectChat(group.external_id)) {
    return {
      title: displayPrivateChatTitle(group, card.contactName),
      badge: "Private chat",
      hint:
        count > 0
          ? `${count} proof${count === 1 ? "" : "s"} sent directly to Wallnut`
          : "Texted Wallnut but has not sent an image or PDF to proof yet",
      emptyMessage: "This contact has not sent proofable images or PDFs yet.",
      lastActiveAt,
    };
  }

  if (card.inviteCode || isPendingGroupExternalId(group.external_id)) {
    return {
      title: group.name?.trim() || "Pending WhatsApp group",
      badge: "Awaiting link",
      hint: "Stale link code on Public — assign groups from a team workspace instead",
      emptyMessage: "Waiting for a group to paste the link code.",
      lastActiveAt,
    };
  }

  const groupTitle = displayPublicUnlinkedGroupName(group);
  if (isWhatsAppGroupChat(group.external_id) && count === 0) {
    return {
      title: groupTitle,
      badge: "Group · idle",
      hint: "Group was detected on WhatsApp — no proofed media yet",
      emptyMessage: "This group messaged Wallnut but has not sent images or PDFs to proof.",
      lastActiveAt,
    };
  }

  if (count > 0) {
    return {
      title: groupTitle,
      badge: "Group proof",
      hint: `${count} proof${count === 1 ? "" : "s"} from an unlinked WhatsApp group`,
      emptyMessage: "No reports in this group.",
      lastActiveAt,
    };
  }

  return {
    title: groupTitle,
    badge: "Unknown source",
    hint: "Activity detected with no proofed media",
    emptyMessage: "No proofed content from this source yet.",
    lastActiveAt,
  };
}

export function isPublicUnlinkedGroupCard(
  group: Pick<Group, "name" | "platform" | "external_id">,
): boolean {
  if (group.platform !== "whatsapp") return true;
  return !isPublicDirectMessageCard(group);
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
  if (
    cleanPush &&
    !looksLikeMessageText(cleanPush) &&
    cleanPush.split(/\s+/).length <= 3 &&
    cleanPush.length <= 32
  ) {
    return cleanPush;
  }
  const digits = phoneDigits(from);
  return digits ? `+${digits}` : "Direct message";
}
