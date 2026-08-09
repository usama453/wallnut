import { createAdminClient } from "@/lib/supabase/server";

export interface UsageRow {
  direction: "inbound" | "outbound";
  msg_type?: string;
  message_id?: string;
  from_phone?: string;
  to_phone?: string;
  group_id?: string;
  status?: string;
  error_code?: string;
  error_detail?: string;
  asset_id?: string;
}

/**
 * Fire-and-forget analytics write. Never blocks the webhook: failures are
 * logged to the console and swallowed so message handling is unaffected.
 */
export function logUsage(row: UsageRow): void {
  void (async () => {
    try {
      const admin = await createAdminClient();
      await admin.from("whatsapp_usage").insert({ ...row, created_at: new Date().toISOString() });
    } catch (err) {
      console.error(`[usage] log failed: ${err instanceof Error ? err.message : err}`);
    }
  })();
}
