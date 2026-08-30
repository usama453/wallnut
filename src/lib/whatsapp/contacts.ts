import { createAdminClient } from "@/lib/supabase/server";
import { fetchWahaGroup } from "@/lib/whatsapp/client";
import { syncOrgWhatsAppAvatars } from "@/lib/whatsapp/avatars";
import { BOT_PHONE_NUMBER } from "@/lib/whatsapp/config";
import { canonicalChatId, isLidJid, isUserPhoneJid, looksLikeMobilePhoneDigits, participantLidJid, phoneDigits, preferParticipantPhone } from "@/lib/whatsapp/jid";
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
      void syncOrgWhatsAppAvatars(input.orgId).catch(() => {});
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
    group.participants.flatMap((participant) => contactsFromGroupParticipant(participant)),
  );
  console.log(
    `[contacts] imported ${count} participant(s) from ${groupJid} for org ${orgId}`,
  );
  void syncOrgWhatsAppAvatars(orgId).catch(() => {});
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

/** Map LID / alternate JIDs to a canonical phone-digit key when names match. */
export function buildContactAliasMap(
  contacts: Array<{ phone: string; display_name: string | null }>,
): Map<string, string> {
  const aliases = new Map<string, string>();

  type Entry = {
    digits: string;
    name: string;
    isLid: boolean;
    isPhone: boolean;
  };

  const entries: Entry[] = [];
  for (const contact of contacts) {
    const digits = phoneDigits(contact.phone);
    const name = contact.display_name?.trim();
    if (!digits || !name || /^[+\d\s.-]+$/.test(name)) continue;
    entries.push({
      digits,
      name: name.toLowerCase(),
      isLid: contact.phone.trim().endsWith("@lid"),
      isPhone:
        (contact.phone.trim().endsWith("@c.us") ||
          contact.phone.trim().endsWith("@s.whatsapp.net")) &&
        digits.length >= 10 &&
        digits.length <= 15,
    });
  }

  const byName = new Map<string, Entry[]>();
  for (const entry of entries) {
    const group = byName.get(entry.name) ?? [];
    group.push(entry);
    byName.set(entry.name, group);
  }

  for (const group of byName.values()) {
    const phoneEntry = group.find(
      (entry) => entry.isPhone && looksLikeMobilePhoneDigits(entry.digits),
    );
    const canonical = phoneEntry?.digits ?? group.find((entry) => entry.isPhone)?.digits;
    if (!canonical) continue;
    for (const entry of group) {
      if (entry.digits !== canonical) {
        aliases.set(entry.digits, canonical);
      }
    }
  }

  return aliases;
}

/** Save both phone and @lid ids for a group participant when available. */
export function contactsFromGroupParticipant(participant: {
  id: string;
  lid?: string | null;
  name?: string | null;
}): Array<{ phone: string; displayName?: string | null }> {
  const rows: Array<{ phone: string; displayName?: string | null }> = [];
  if (participant.id) {
    rows.push({ phone: participant.id, displayName: participant.name });
  }
  if (participant.lid && participant.lid !== participant.id) {
    rows.push({ phone: participant.lid, displayName: participant.name });
  }
  return rows;
}

/** Canonical phone-digit key -> saved contact name. */
export function buildCanonicalNameIndex(
  contacts: Array<{ phone: string; display_name: string | null }>,
  aliasMap: Map<string, string>,
): Map<string, string> {
  const names = new Map<string, string>();
  for (const contact of contacts) {
    const name = contact.display_name?.trim();
    if (!name || /^[+\d\s.-]+$/.test(name)) continue;
    const digits = phoneDigits(contact.phone);
    if (!digits) continue;
    const canonical = aliasMap.get(digits) ?? digits;
    names.set(canonical, name);
    names.set(digits, name);
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
