/** WhatsApp group name lookup via the Baileys bridge groups API. */

import { fetchWahaGroup } from "./client";

/**
 * Fetch the real WhatsApp group name (subject) from the groups API.
 * Falls back to a truncated JID name if the API call fails.
 */
export async function getGroupName(groupId: string): Promise<string> {
  const group = await fetchWahaGroup(groupId);
  return group?.subject?.trim() || fallbackGroupName(groupId);
}

export function fallbackGroupName(groupId: string): string {
  return `WhatsApp group ${groupId.endsWith("@g.us") ? groupId.slice(0, 12) + "…" : groupId}`;
}
