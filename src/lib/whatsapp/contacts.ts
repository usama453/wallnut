import { createAdminClient } from "@/lib/supabase/server";
import { canonicalChatId, phoneDigits } from "@/lib/whatsapp/jid";

/** Remember a WhatsApp sender's display name for rankings and avatars. */
export function rememberWhatsAppContact(input: {
  orgId: string | null;
  phone: string;
  displayName?: string | null;
}): void {
  void (async () => {
    if (!input.orgId || !input.phone) return;
    const name = input.displayName?.trim();
    if (!name) return;
    try {
      const admin = await createAdminClient();
      const phone = canonicalChatId(input.phone);
      await admin.from("whatsapp_contacts").upsert(
        {
          phone,
          org_id: input.orgId,
          display_name: name,
        },
        { onConflict: "phone" },
      );
    } catch (error) {
      console.error(
        `[contacts] upsert failed: ${error instanceof Error ? error.message : error}`,
      );
    }
  })();
}

export async function loadWhatsAppContactNames(phones: string[]) {
  const unique = [...new Set(phones.map(phoneDigits).filter(Boolean))];
  if (unique.length === 0) return new Map<string, string>();

  const variants = unique.flatMap((digits) => [
    digits,
    `${digits}@c.us`,
    `${digits}@s.whatsapp.net`,
  ]);

  const admin = await createAdminClient();
  const { data, error } = await admin
    .from("whatsapp_contacts")
    .select("phone, display_name")
    .in("phone", variants)
    .not("display_name", "is", null);

  if (error || !data) return new Map<string, string>();

  const wanted = new Set(unique);
  const names = new Map<string, string>();
  for (const row of data) {
    const digits = phoneDigits(row.phone);
    if (!wanted.has(digits) || !row.display_name) continue;
    names.set(digits, row.display_name);
  }
  return names;
}
