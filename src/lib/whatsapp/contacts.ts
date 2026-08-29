import { createAdminClient } from "@/lib/supabase/server";
import { fetchWahaGroup } from "@/lib/whatsapp/client";
import { BOT_PHONE_NUMBER } from "@/lib/whatsapp/config";
import { canonicalChatId, phoneDigits } from "@/lib/whatsapp/jid";
import { isPendingGroupExternalId } from "@/lib/whatsapp/placeholder-groups";

const syncedAt = new Map<string, number>();
const SYNC_TTL_MS = 60_000;

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
      await saveWhatsAppContacts(input.orgId, [
        { phone: input.phone, displayName: name },
      ]);
    } catch (error) {
      console.error(
        `[contacts] upsert failed: ${error instanceof Error ? error.message : error}`,
      );
    }
  })();
}

export async function saveWhatsAppContacts(
  orgId: string,
  contacts: Array<{ phone: string; displayName?: string | null }>,
) {
  if (!orgId || contacts.length === 0) return 0;
  const rows: Array<{ phone: string; org_id: string; display_name: string | null }> = [];
  const seen = new Set<string>();
  for (const contact of contacts) {
    if (!contact.phone || isBotJid(contact.phone) || isNonUserJid(contact.phone)) continue;
    const phone = canonicalChatId(contact.phone);
    if (!phone || seen.has(phone)) continue;
    seen.add(phone);
    rows.push({
      phone,
      org_id: orgId,
      display_name: contact.displayName?.trim() || null,
    });
  }
  if (rows.length === 0) return 0;

  const admin = await createAdminClient();
  const { data: existing } = await admin
    .from("whatsapp_contacts")
    .select("phone, display_name")
    .in("phone", rows.map((row) => row.phone));
  const keptName = new Map(
    (existing ?? []).map((row) => [row.phone, row.display_name as string | null]),
  );

  const { error } = await admin.from("whatsapp_contacts").upsert(
    rows.map((row) => ({
      phone: row.phone,
      org_id: row.org_id,
      display_name: row.display_name || keptName.get(row.phone) || null,
    })),
    { onConflict: "phone" },
  );
  if (error) {
    throw new Error(error.message);
  }
  return rows.length;
}

export async function importWhatsAppGroupContacts(orgId: string, groupJid: string) {
  const group = await fetchWahaGroup(groupJid, { timeoutMs: 5000 });
  if (!group) return 0;
  const count = await saveWhatsAppContacts(
    orgId,
    group.participants.map((participant) => ({
      phone: participant.id,
      displayName: participant.name,
    })),
  );
  console.log(
    `[contacts] imported ${count} participant(s) from ${groupJid} for org ${orgId}`,
  );
  return count;
}

export async function syncOrgWhatsAppGroupContacts(
  orgId: string,
  options?: { force?: boolean },
) {
  if (!orgId) return;
  const previous = syncedAt.get(orgId) ?? 0;
  if (!options?.force && Date.now() - previous < SYNC_TTL_MS) return;
  syncedAt.set(orgId, Date.now());

  try {
    const admin = await createAdminClient();
    const { data: groups } = await admin
      .from("groups")
      .select("external_id")
      .eq("org_id", orgId)
      .eq("platform", "whatsapp");
    const claimed = (groups ?? [])
      .map((group) => group.external_id)
      .filter((externalId): externalId is string =>
        Boolean(
          externalId &&
            externalId.endsWith("@g.us") &&
            !isPendingGroupExternalId(externalId),
        ),
      )
      .slice(0, 8);

    const imported = await Promise.all(
      claimed.map((groupJid) =>
        importWhatsAppGroupContacts(orgId, groupJid).catch((error) => {
          console.error(
            `[contacts] group sync failed ${groupJid}: ${error instanceof Error ? error.message : error}`,
          );
          return 0;
        }),
      ),
    );
    if (claimed.length > 0 && imported.reduce((sum, count) => sum + count, 0) === 0) {
      syncedAt.delete(orgId);
    }
  } catch (error) {
    syncedAt.delete(orgId);
    console.error(
      `[contacts] org sync failed: ${error instanceof Error ? error.message : error}`,
    );
  }
}

export async function loadOrgWhatsAppContacts(orgId: string) {
  if (!orgId) return [];
  const admin = await createAdminClient();
  const { data, error } = await admin
    .from("whatsapp_contacts")
    .select("phone, display_name")
    .eq("org_id", orgId);
  if (error || !data) return [];
  return data.filter((row) => row.phone && !isBotJid(row.phone));
}

export async function loadWhatsAppContactNames(phones: string[]) {
  const unique = [...new Set(phones.map(phoneDigits).filter(Boolean))];
  if (unique.length === 0) return new Map<string, string>();

  const variants = unique.flatMap((digits) => [
    digits,
    `${digits}@c.us`,
    `${digits}@s.whatsapp.net`,
    `${digits}@lid`,
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

function isNonUserJid(jid: string) {
  const value = jid.trim();
  return (
    value.endsWith("@g.us") ||
    value.endsWith("@broadcast") ||
    value.startsWith("status@") ||
    value.startsWith("pending:")
  );
}

function isBotJid(jid: string) {
  const bot = phoneDigits(BOT_PHONE_NUMBER);
  const digits = phoneDigits(jid);
  if (!bot || !digits) return false;
  if (bot.length < 8 || digits.length < 8) return digits === bot;
  return digits.slice(-10) === bot.slice(-10);
}
