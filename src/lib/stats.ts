import { createClient } from "@/lib/supabase/server";
import { resolveConnection } from "@/lib/whatsapp/connection";
import { fetchWahaContactName } from "@/lib/whatsapp/client";
import {
  loadOrgWhatsAppContacts,
  loadWhatsAppContactNames,
  rememberWhatsAppContact,
  syncOrgWhatsAppGroupContacts,
} from "@/lib/whatsapp/contacts";
import { phoneDigits, whatsappAvatarContact } from "@/lib/whatsapp/jid";

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

  const byPerson = new Map<string, PersonStats>();

  for (const u of usageRows) {
    const assetId = u.asset_id as string;
    const versionId = versionByAsset.get(assetId);
    const proof = versionId ? proofByVersion.get(versionId) : undefined;
    const phone = (u.from_phone as string | null) ?? null;
    const key = personKey(phone);

    const entry =
      byPerson.get(key) ??
      {
        key,
        phone,
        display: phone ? formatPhone(phone) : "Dashboard",
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

  if (orgId) {
    await syncOrgWhatsAppGroupContacts(orgId);
    const contacts = await loadOrgWhatsAppContacts(orgId);
    for (const contact of contacts) {
      const key = personKey(contact.phone);
      if (key === "__dashboard__") continue;
      const existing = byPerson.get(key);
      if (existing) {
        if (contact.display_name && looksLikePhoneLabel(existing.display)) {
          existing.display = contact.display_name;
        }
        continue;
      }
      byPerson.set(key, {
        key,
        phone: contact.phone,
        display: contact.display_name?.trim() || formatPhone(contact.phone),
        avatarUrl: null,
        uploads: 0,
        typos: 0,
        avgScore: null,
      });
    }
  }

  const people = await enrichPeople([...byPerson.values()], orgId);
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
      uploads: people.reduce((n, p) => n + p.uploads, 0),
      typos: people.reduce((n, p) => n + p.typos, 0),
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
): Promise<PersonStats[]> {
  const phones = people.map((person) => person.phone).filter(Boolean) as string[];
  const [stored, contacts, connection] = await Promise.all([
    loadWhatsAppContactNames(phones).catch(() => new Map<string, string>()),
    orgId ? loadOrgWhatsAppContacts(orgId) : Promise.resolve([]),
    Promise.resolve(resolveConnection()),
  ]);

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
    const digits = phoneDigits(person.phone);
    const display = (digits && stored.get(digits)) || person.display;
    const contactKey =
      whatsappAvatarContact(person.phone) ??
      (digits ? whatsappAvatarContact(contactByDigits.get(digits) ?? null) : null);
    return {
      ...person,
      display,
      avatarUrl:
        connection && contactKey
          ? `/api/whatsapp/avatar?contact=${encodeURIComponent(contactKey)}`
          : null,
    };
  });
}

function personKey(phone: string | null | undefined) {
  if (!phone) return "__dashboard__";
  return phoneDigits(phone) || phone;
}

function looksLikePhoneLabel(label: string) {
  return /^[+\d\s.-]+$/.test(label.trim());
}

function formatPhone(raw: string): string {
  const s = raw.replace(/\D/g, "");
  if (s.length === 12) return `+${s.slice(0, 2)} ${s.slice(2, 5)} ${s.slice(5, 8)} ${s.slice(8)}`;
  if (s.length === 11) return `+${s[0]} ${s.slice(1, 4)} ${s.slice(4, 7)} ${s.slice(7)}`;
  if (s.length === 10) return `${s.slice(0, 3)} ${s.slice(3, 6)} ${s.slice(6)}`;
  return raw;
}
