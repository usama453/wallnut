import type { Group, GroupPlatform } from "@/types";

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
