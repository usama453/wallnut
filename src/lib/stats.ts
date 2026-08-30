import { createClient } from "@/lib/supabase/server";
import { resolveConnection } from "@/lib/whatsapp/connection";
import { fetchWahaContactName } from "@/lib/whatsapp/client";
import {
  loadOrgWhatsAppContacts,
  loadWhatsAppContactNames,
  rememberWhatsAppContact,
  syncOrgWhatsAppGroupContacts,
  buildContactAliasMap,
  buildCanonicalNameIndex,
} from "@/lib/whatsapp/contacts";
import {
  avatarProxyUrl,
  loadCachedAvatarPaths,
  syncOrgWhatsAppAvatars,
} from "@/lib/whatsapp/avatars";
import {
  isLidJid,
  isUserPhoneJid,
  phoneDigits,
  whatsappAvatarContact,
} from "@/lib/whatsapp/jid";

export interface PersonStats {
  key: string;
  phone: string | null;
  display: string;
  avatarUrl: string | null;
  uploads: number;
  typos: number;
  avgScore: number | null;
}

/**
 * Per-phone leaderboard stats across the org's WhatsApp proofing activity.
 *
 * Attribution chain:
 *   whatsapp_usage (from_phone, asset_id, msg_type='proof')
 *     → assets → asset_versions → proofs → proof_issues
 *
 * Uploads + typos are counted for every distinct phone that sent a design in
 * for proofing. Assets not tied to a phone are grouped under "Dashboard".
 */
export async function getStats(orgIdOverride?: string | null) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, organizations(name, slug)")
    .eq("id", user.id)
    .maybeSingle();
  const organization = Array.isArray(profile?.organizations)
    ? profile.organizations[0] ?? null
    : profile?.organizations ?? null;
  const orgId = orgIdOverride ?? ((profile?.org_id as string | null) ?? null);

  const { data: orgAssets } = orgId
    ? await supabase.from("assets").select("id").eq("org_id", orgId).limit(500)
    : { data: null };
  const orgAssetIds = new Set((orgAssets ?? []).map((asset) => asset.id));

  // Proofing activity, scoped to this workspace.
  const { data: usage } = orgAssetIds.size
    ? await supabase
        .from("whatsapp_usage")
        .select("from_phone, asset_id, status")
        .eq("direction", "inbound")
        .eq("msg_type", "proof")
        .in("asset_id", [...orgAssetIds])
        .limit(500)
    : { data: [] };

  const usageRows = (usage ?? []).filter(
    (row) => row.asset_id && orgAssetIds.has(row.asset_id),
  );

  const assetIds = [...new Set(usageRows.map((u) => u.asset_id as string))];
  const { data: versions } = assetIds.length
    ? await supabase
        .from("asset_versions")
        .select("id, asset_id, version")
        .in("asset_id", assetIds)
        .order("version", { ascending: false })
    : { data: null };

  // Latest version id per asset (highest version).
  const versionByAsset = new Map<string, string>();
  for (const v of versions ?? []) {
    if (!versionByAsset.has(v.asset_id)) versionByAsset.set(v.asset_id, v.id);
  }
  const versionIds = [...versionByAsset.values()];

  const { data: proofs } = versionIds.length
    ? await supabase.from("proofs").select("id, asset_version_id, score").in("asset_version_id", versionIds)
    : { data: null };
  const proofByVersion = new Map<string, { id: string; score: number }>();
  for (const p of proofs ?? []) proofByVersion.set(p.asset_version_id, p);

  const proofIds = (proofs ?? []).map((p) => p.id);
  const { data: issues } = proofIds.length
    ? await supabase.from("proof_issues").select("proof_id").in("proof_id", proofIds)
    : { data: null };
  const issueByProof = new Map<string, number>();
  for (const i of issues ?? []) issueByProof.set(i.proof_id, (issueByProof.get(i.proof_id) ?? 0) + 1);

  let contacts: Array<{ phone: string; display_name: string | null }> = [];
  let aliasMap = new Map<string, string>();
  if (orgId) {
    await syncOrgWhatsAppGroupContacts(orgId);
    contacts = await loadOrgWhatsAppContacts(orgId);
    aliasMap = buildContactAliasMap(contacts);
    void syncOrgWhatsAppAvatars(orgId).catch(() => {});
  }

  const byPerson = new Map<string, PersonStats>();

  for (const u of usageRows) {
    const assetId = u.asset_id as string;
    const versionId = versionByAsset.get(assetId);
    const proof = versionId ? proofByVersion.get(versionId) : undefined;
    const phone = (u.from_phone as string | null) ?? null;
    const key = personKey(phone, aliasMap);

    const entry =
      byPerson.get(key) ??
      {
        key,
        phone: canonicalPersonPhone(phone, aliasMap, contacts),
        display: phone ? formatPhone(phone, aliasMap) : "Dashboard",
        avatarUrl: null,
        uploads: 0,
        typos: 0,
        avgScore: null as number | null,
      };

    entry.uploads += 1;
    if (proof) {
      entry.typos += issueByProof.get(proof.id) ?? 0;
      const prev = entry.avgScore ?? proof.score;
      entry.avgScore = Math.round((prev * (entry.uploads - 1) + proof.score) / entry.uploads);
    }
    byPerson.set(key, entry);
  }

  for (const contact of contacts) {
    const key = personKey(contact.phone, aliasMap);
    if (key === "__dashboard__") continue;
    const existing = byPerson.get(key);
    if (existing) {
      if (contact.display_name && looksLikePhoneLabel(existing.display)) {
        existing.display = contact.display_name;
      }
      if (isUserPhoneJid(contact.phone) && isLidJid(existing.phone)) {
        existing.phone = contact.phone;
      }
      continue;
    }
    byPerson.set(key, {
      key,
      phone: canonicalPersonPhone(contact.phone, aliasMap, contacts) ?? contact.phone,
      display: contact.display_name?.trim() || formatPhone(contact.phone, aliasMap),
      avatarUrl: null,
      uploads: 0,
      typos: 0,
      avgScore: null,
    });
  }

  const people = dedupePeople(
    await enrichPeople([...byPerson.values()], orgId, aliasMap, contacts),
    aliasMap,
    buildCanonicalNameIndex(contacts, aliasMap),
  );
  const visible = people.filter((person) => person.phone);
  const byName = (a: PersonStats, b: PersonStats) => a.display.localeCompare(b.display);

  const byUploads = [...visible].sort(
    (a, b) => b.uploads - a.uploads || b.typos - a.typos || byName(a, b),
  );
  const byTypos = [...visible].sort(
    (a, b) => b.typos - a.typos || b.uploads - a.uploads || byName(a, b),
  );

  return {
    orgName: organization?.name ?? "My workspace",
    orgSlug: organization?.slug ?? null,
    byUploads,
    byTypos,
    totals: {
      uploads: visible.reduce((n, p) => n + p.uploads, 0),
      typos: visible.reduce((n, p) => n + p.typos, 0),
      people: visible.length,
      checked: proofs?.length ?? 0,
      avgScore:
        proofs?.length
          ? Math.round(
              proofs.reduce((sum, proof) => sum + proof.score, 0) /
                proofs.length,
            )
          : null,
    },
  };
}

async function enrichPeople(
  people: PersonStats[],
  orgId: string | null,
  aliasMap: Map<string, string>,
  seedContacts: Array<{ phone: string; display_name: string | null }>,
): Promise<PersonStats[]> {
  const phones = people.map((person) => person.phone).filter(Boolean) as string[];
  const [stored, contacts, connection] = await Promise.all([
    loadWhatsAppContactNames(phones).catch(() => new Map<string, string>()),
    orgId ? loadOrgWhatsAppContacts(orgId) : Promise.resolve(seedContacts),
    Promise.resolve(resolveConnection()),
  ]);
  const avatarPaths = orgId
    ? await loadCachedAvatarPaths(orgId, contacts)
    : new Map<string, string>();
  const nameIndex = buildCanonicalNameIndex(contacts, aliasMap);

  const contactByDigits = new Map<string, string>();
  for (const row of contacts) {
    const digits = phoneDigits(row.phone);
    if (!digits) continue;
    const existing = contactByDigits.get(digits);
    if (!existing || (!existing.includes("@") && row.phone.includes("@"))) {
      contactByDigits.set(digits, row.phone);
    }
  }

  const missing = phones.filter((phone) => !stored.get(phoneDigits(phone)));
  const live = await Promise.all(
    missing.slice(0, 20).map(async (phone) => {
      const name = await fetchWahaContactName(phone);
      return [phone, phoneDigits(phone), name] as const;
    }),
  );
  for (const [phone, digits, name] of live) {
    if (!name) continue;
    stored.set(digits, name);
    rememberWhatsAppContact({ orgId, phone, displayName: name });
  }

  return people.map((person) => {
    const digits = personKey(person.phone, aliasMap);
    const display =
      nameIndex.get(digits) || stored.get(digits) || person.display;
    const contactKey =
      whatsappAvatarContact(person.phone) ??
      (digits ? whatsappAvatarContact(contactByDigits.get(digits) ?? null) : null);
    const hasCachedAvatar = Boolean(digits && avatarPaths.has(digits));
    const proxyUrl = contactKey && (connection || hasCachedAvatar)
      ? avatarProxyUrl(contactKey)
      : null;
    return {
      ...person,
      key: digits,
      display,
      avatarUrl: proxyUrl,
    };
  });
}

function dedupePeople(
  people: PersonStats[],
  aliasMap: Map<string, string>,
  nameIndex: Map<string, string>,
): PersonStats[] {
  const normalized = people.map((person) => {
    const digits = personKey(person.phone, aliasMap);
    const savedName = nameIndex.get(digits);
    if (savedName && looksLikePhoneLabel(person.display)) {
      return { ...person, display: savedName, key: digits };
    }
    return { ...person, key: digits };
  });

  return mergePeopleByAvatar(
    mergePeopleByResolvedName(mergePeopleByDisplayName(normalized), nameIndex),
  );
}

function mergePeopleByResolvedName(
  people: PersonStats[],
  nameIndex: Map<string, string>,
): PersonStats[] {
  const groups = new Map<string, PersonStats[]>();
  for (const person of people) {
    const name = nameIndex.get(person.key)?.trim().toLowerCase();
    if (!name || looksLikePhoneLabel(name)) continue;
    const group = groups.get(name) ?? [];
    group.push(person);
    groups.set(name, group);
  }

  const absorbed = new Set<string>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const primary = pickPrimaryPerson(group);
    for (const person of group) {
      if (person.key === primary.key) continue;
      absorbPerson(primary, person);
      absorbed.add(person.key);
    }
  }

  return people.filter((person) => !absorbed.has(person.key));
}

function mergePeopleByDisplayName(people: PersonStats[]): PersonStats[] {
  const groups = new Map<string, PersonStats[]>();
  for (const person of people) {
    const label = person.display.trim();
    if (!label || looksLikePhoneLabel(label)) continue;
    const key = label.toLowerCase();
    const group = groups.get(key) ?? [];
    group.push(person);
    groups.set(key, group);
  }

  const absorbed = new Set<string>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const primary = pickPrimaryPerson(group);
    for (const person of group) {
      if (person.key === primary.key) continue;
      absorbPerson(primary, person);
      absorbed.add(person.key);
    }
  }

  return people.filter((person) => !absorbed.has(person.key));
}

function mergePeopleByAvatar(people: PersonStats[]): PersonStats[] {
  const groups = new Map<string, PersonStats[]>();
  for (const person of people) {
    if (!person.avatarUrl) continue;
    const group = groups.get(person.avatarUrl) ?? [];
    group.push(person);
    groups.set(person.avatarUrl, group);
  }

  const absorbed = new Set<string>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const primary = pickPrimaryPerson(group);
    for (const person of group) {
      if (person.key === primary.key) continue;
      absorbPerson(primary, person);
      absorbed.add(person.key);
    }
  }

  return people.filter((person) => !absorbed.has(person.key));
}

function absorbPerson(primary: PersonStats, person: PersonStats) {
  const totalUploads = primary.uploads + person.uploads;
  if (primary.avgScore != null && person.avgScore != null && totalUploads > 0) {
    primary.avgScore = Math.round(
      (primary.avgScore * primary.uploads + person.avgScore * person.uploads) /
        totalUploads,
    );
  } else if (primary.avgScore == null) {
    primary.avgScore = person.avgScore;
  }
  primary.uploads = totalUploads;
  primary.typos += person.typos;
  if (looksLikePhoneLabel(primary.display) && !looksLikePhoneLabel(person.display)) {
    primary.display = person.display;
  }
  if (isUserPhoneJid(person.phone ?? "") && isLidJid(primary.phone)) {
    primary.phone = person.phone;
  }
}

function pickPrimaryPerson(group: PersonStats[]): PersonStats {
  return [...group].sort((a, b) => {
    const aPhone = isUserPhoneJid(a.phone ?? "") ? 1 : 0;
    const bPhone = isUserPhoneJid(b.phone ?? "") ? 1 : 0;
    if (aPhone !== bPhone) return bPhone - aPhone;
    return b.uploads - a.uploads || b.typos - a.typos;
  })[0]!;
}

function canonicalPersonPhone(
  phone: string | null,
  aliasMap: Map<string, string>,
  contacts: Array<{ phone: string; display_name: string | null }>,
): string | null {
  if (!phone) return null;
  const digits = phoneDigits(phone);
  const canonicalDigits = aliasMap.get(digits) ?? digits;
  const phoneContact = contacts.find(
    (contact) =>
      isUserPhoneJid(contact.phone) && phoneDigits(contact.phone) === canonicalDigits,
  );
  return phoneContact?.phone ?? phone;
}

function personKey(phone: string | null | undefined, aliases?: Map<string, string>) {
  if (!phone) return "__dashboard__";
  const digits = phoneDigits(phone);
  if (!digits) return phone;
  return aliases?.get(digits) ?? digits;
}

function looksLikePhoneLabel(label: string) {
  return /^[+\d\s.-]+$/.test(label.trim());
}

function formatPhone(raw: string, aliases?: Map<string, string>): string {
  const digits = aliases?.get(phoneDigits(raw)) ?? phoneDigits(raw);
  if (!digits) return raw;
  if (digits.length === 12) return `+${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
  if (digits.length === 11) return `+${digits[0]} ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  return `+${digits}`;
}
