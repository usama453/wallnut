import type { SupabaseClient } from "@supabase/supabase-js";

export interface WhatsAppAccessState {
  mode: "all" | "allowlist";
  allowed: Set<string>;
}

/** No settings row → respond to everyone (current default behavior). */
const OPEN_ACCESS: WhatsAppAccessState = { mode: "all", allowed: new Set() };

/**
 * Load the response-gating state for an org. Throws are swallowed by callers —
 * gating must never break proofing.
 */
export async function loadAccessState(
  admin: SupabaseClient,
  orgId: string | null,
): Promise<WhatsAppAccessState> {
  if (!orgId) return OPEN_ACCESS;
  try {
    const { data: settings } = await admin
      .from("whatsapp_settings")
      .select("response_mode")
      .eq("org_id", orgId)
      .maybeSingle();
    const mode = settings?.response_mode === "allowlist" ? "allowlist" : "all";
    if (mode === "all") return OPEN_ACCESS;
    const { data: rows } = await admin
      .from("whatsapp_allowlist")
      .select("chat_id")
      .eq("org_id", orgId);
    return { mode, allowed: new Set((rows ?? []).map((r) => r.chat_id)) };
  } catch {
    return OPEN_ACCESS;
  }
}

/** Record an inbound chat so the dashboard can offer one-click allow. */
export async function trackSeenChat(
  admin: SupabaseClient,
  orgId: string | null,
  chatId: string,
  preview?: string,
) {
  try {
    const label = preview?.slice(0, 120) ?? null;
    const { data: existing } = await admin
      .from("whatsapp_seen_chats")
      .select("message_count")
      .eq("chat_id", chatId)
      .maybeSingle();
    if (existing) {
      await admin
        .from("whatsapp_seen_chats")
        .update({ message_count: existing.message_count + 1, last_message_at: new Date().toISOString(), ...(label ? { label } : {}) })
        .eq("chat_id", chatId);
    } else {
      await admin.from("whatsapp_seen_chats").insert({
        chat_id: chatId,
        org_id: orgId,
        label,
        message_count: 1,
      });
    }
  } catch {
    // best-effort only
  }
}
