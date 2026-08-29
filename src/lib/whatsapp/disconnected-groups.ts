import { createAdminClient } from "@/lib/supabase/server";
import { whatsappGroupIdVariants } from "./jid";

export async function isWhatsAppGroupDisconnected(groupJid: string) {
  const variants = whatsappGroupIdVariants(groupJid);
  if (variants.length === 0) return false;
  try {
    const admin = await createAdminClient();
    const { data } = await admin
      .from("whatsapp_disconnected_groups")
      .select("group_jid")
      .in("group_jid", variants)
      .limit(1);
    return Boolean(data?.length);
  } catch {
    return false;
  }
}

export async function markWhatsAppGroupDisconnected(orgId: string, groupJid: string) {
  const admin = await createAdminClient();
  const canonical = whatsappGroupIdVariants(groupJid).find((jid) => jid.endsWith("@g.us"))
    ?? groupJid;
  const { error } = await admin.from("whatsapp_disconnected_groups").upsert(
    {
      group_jid: canonical,
      org_id: orgId,
      disconnected_at: new Date().toISOString(),
    },
    { onConflict: "group_jid" },
  );
  if (error) throw new Error(error.message);
}

export async function clearDisconnectedWhatsAppGroup(groupJid: string) {
  const variants = whatsappGroupIdVariants(groupJid);
  if (variants.length === 0) return;
  try {
    const admin = await createAdminClient();
    await admin.from("whatsapp_disconnected_groups").delete().in("group_jid", variants);
  } catch {
    // best-effort
  }
}
