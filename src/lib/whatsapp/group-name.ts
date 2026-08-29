/** WAHA-only group name lookup.
 *
 * The WAHA groups API (/api/{session}/groups/{groupId}) returns the real
 * WhatsApp group subject. We use that as the canonical group name in the
 * auth-code claiming flow, so the dashboard shows the actual group name,
 * not a truncated JID.
 */

import { WAHA_BASE_URL, WAHA_API_KEY, WAHA_SESSION } from "./config";

/**
 * Fetch the real WhatsApp group name (subject) from WAHA's groups API.
 * Falls back to a truncated JID name if the API call fails.
 */
export async function getGroupName(groupId: string): Promise<string> {
  try {
    const res = await fetch(
      `${WAHA_BASE_URL}/api/${WAHA_SESSION}/groups/${encodeURIComponent(groupId)}`,
      { headers: { "X-Api-Key": WAHA_API_KEY } },
    );
    if (!res.ok) return fallbackName(groupId);
    const meta = (await res.json()) as { subject?: string; name?: string };
    if (meta.subject) return meta.subject;
    if (meta.name) return meta.name;
    return fallbackName(groupId);
  } catch {
    return fallbackName(groupId);
  }
}

function fallbackName(groupId: string): string {
  return `WhatsApp group ${groupId.endsWith("@g.us") ? groupId.slice(0, 12) + "…" : groupId}`;
}
