import { createAdminClient } from "@/lib/supabase/server";
import { BUCKET } from "@/lib/proof/runProof";
import { resolveConnection } from "@/lib/whatsapp/connection";
import { canonicalChatId, phoneDigits, whatsappAvatarJid } from "@/lib/whatsapp/jid";

const AVATAR_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SYNC_TTL_MS = 60_000;
const SYNC_LIMIT = 24;
const syncedAt = new Map<string, number>();

export interface CachedAvatarRow {
  phone: string;
  avatar_path: string | null;
  avatar_mime: string | null;
  avatar_cached_at: string | null;
}

/** All JID / phone forms we store contacts under. */
export function contactPhoneVariants(contact: string): string[] {
  const value = contact.trim();
  if (!value) return [];
  const digits = phoneDigits(value);
  const variants = new Set<string>([canonicalChatId(value)]);
  if (digits) {
    variants.add(`${digits}@c.us`);
    variants.add(`${digits}@s.whatsapp.net`);
    variants.add(`${digits}@lid`);
  }
  if (value.includes("@")) variants.add(value);
  return [...variants].filter(Boolean);
}

function avatarStoragePath(orgId: string, phone: string, mime: string): string {
  const digits = phoneDigits(phone) || phone.replace(/[^a-zA-Z0-9._-]/g, "_");
  const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
  return `${orgId}/whatsapp-avatars/${digits}.${ext}`;
}

function isFresh(cachedAt: string | null | undefined): boolean {
  if (!cachedAt) return false;
  return Date.now() - new Date(cachedAt).getTime() < AVATAR_TTL_MS;
}

async function fetchAvatarBytes(contact: string): Promise<{ buffer: Buffer; mime: string } | null> {
  const connection = await resolveConnection();
  if (!connection) return null;

  const jid = whatsappAvatarJid(contact);
  if (phoneDigits(jid).length < 6) return null;

  const base = connection.baseUrl.endsWith("/")
    ? connection.baseUrl
    : `${connection.baseUrl}/`;
  const target = new URL(
    `api/${encodeURIComponent(connection.session)}/contacts/${encodeURIComponent(jid)}/profile-picture`,
    base,
  );

  const response = await fetch(target, {
    headers: { "X-Api-Key": connection.apiKey },
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) return null;

  const mime = response.headers.get("content-type") || "image/jpeg";
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) return null;
  return { buffer, mime };
}

/** Download a profile picture from WhatsApp and persist it for this contact. */
export async function cacheWhatsAppAvatar(args: {
  orgId: string;
  phone: string;
  force?: boolean;
}): Promise<string | null> {
  const orgId = args.orgId?.trim();
  const phone = canonicalChatId(args.phone);
  if (!orgId || !phone) return null;

  const admin = await createAdminClient();
  const variants = contactPhoneVariants(phone);
  const { data: existing } = await admin
    .from("whatsapp_contacts")
    .select("phone, avatar_path, avatar_mime, avatar_cached_at")
    .in("phone", variants)
    .eq("org_id", orgId)
    .not("avatar_path", "is", null)
    .order("avatar_cached_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!args.force && existing?.avatar_path && isFresh(existing.avatar_cached_at)) {
    return existing.avatar_path;
  }

  const fetched = await fetchAvatarBytes(phone);
  if (!fetched) return existing?.avatar_path ?? null;

  const path = avatarStoragePath(orgId, phone, fetched.mime);
  const { error: uploadError } = await admin.storage.from(BUCKET).upload(path, fetched.buffer, {
    contentType: fetched.mime,
    upsert: true,
  });
  if (uploadError) {
    console.error(`[avatars] upload failed for ${phone}: ${uploadError.message}`);
    return existing?.avatar_path ?? null;
  }

  const cachedAt = new Date().toISOString();
  const { data: existingRows } = await admin
    .from("whatsapp_contacts")
    .select("phone, display_name")
    .in("phone", variants);
  const names = new Map(
    (existingRows ?? []).map((row) => [row.phone, row.display_name as string | null]),
  );
  const rows = variants.map((variant) => ({
    phone: variant,
    org_id: orgId,
    display_name: names.get(variant) ?? null,
    avatar_path: path,
    avatar_mime: fetched.mime,
    avatar_cached_at: cachedAt,
  }));
  const { error: upsertError } = await admin.from("whatsapp_contacts").upsert(rows, {
    onConflict: "phone",
  });
  if (upsertError) {
    console.error(`[avatars] db upsert failed for ${phone}: ${upsertError.message}`);
  }

  return path;
}

/** Load cached avatar paths keyed by phone digits (includes alias targets). */
export async function loadCachedAvatarPaths(
  orgId: string,
  contacts: Array<{ phone: string }>,
): Promise<Map<string, string>> {
  if (!orgId) return new Map();
  const variants = new Set(contacts.flatMap((row) => contactPhoneVariants(row.phone)));
  if (!variants.size) return new Map();

  const admin = await createAdminClient();
  const { data } = await admin
    .from("whatsapp_contacts")
    .select("phone, avatar_path, avatar_cached_at")
    .eq("org_id", orgId)
    .in("phone", [...variants])
    .not("avatar_path", "is", null);

  const paths = new Map<string, string>();
  for (const row of data ?? []) {
    if (!row.avatar_path || !isFresh(row.avatar_cached_at)) continue;
    paths.set(phoneDigits(row.phone), row.avatar_path);
  }
  return paths;
}

export function avatarProxyUrl(contact: string | null | undefined): string | null {
  const value = contact?.trim();
  if (!value) return null;
  return `/api/whatsapp/avatar?contact=${encodeURIComponent(value)}`;
}

/** Best-effort background refresh for org members missing or stale avatars. */
export async function syncOrgWhatsAppAvatars(
  orgId: string,
  options?: { force?: boolean },
): Promise<number> {
  if (!orgId) return 0;
  const previous = syncedAt.get(orgId) ?? 0;
  if (!options?.force && Date.now() - previous < SYNC_TTL_MS) return 0;
  syncedAt.set(orgId, Date.now());

  const admin = await createAdminClient();
  const { data: contacts } = await admin
    .from("whatsapp_contacts")
    .select("phone, avatar_path, avatar_cached_at")
    .eq("org_id", orgId);

  const stale = (contacts ?? []).filter(
    (row) => !row.avatar_path || !isFresh(row.avatar_cached_at),
  );
  const seen = new Set<string>();
  const targets: string[] = [];
  for (const row of stale) {
    const digits = phoneDigits(row.phone);
    if (!digits || seen.has(digits)) continue;
    seen.add(digits);
    targets.push(row.phone);
    if (targets.length >= SYNC_LIMIT) break;
  }

  let cached = 0;
  for (const phone of targets) {
    try {
      const path = await cacheWhatsAppAvatar({ orgId, phone, force: options?.force });
      if (path) cached += 1;
    } catch (error) {
      console.error(
        `[avatars] sync failed for ${phone}: ${error instanceof Error ? error.message : error}`,
      );
    }
  }
  return cached;
}

export async function readCachedAvatarFromStorage(path: string): Promise<{
  buffer: Buffer;
  mime: string;
} | null> {
  const admin = await createAdminClient();
  const { data, error } = await admin.storage.from(BUCKET).download(path);
  if (error || !data) return null;
  const buffer = Buffer.from(await data.arrayBuffer());
  if (!buffer.length) return null;
  return { buffer, mime: "image/jpeg" };
}

export async function findCachedAvatarForContact(
  orgId: string,
  contact: string,
): Promise<CachedAvatarRow | null> {
  const variants = contactPhoneVariants(contact);
  if (!orgId || !variants.length) return null;

  const admin = await createAdminClient();
  const { data } = await admin
    .from("whatsapp_contacts")
    .select("phone, avatar_path, avatar_mime, avatar_cached_at")
    .eq("org_id", orgId)
    .in("phone", variants)
    .not("avatar_path", "is", null)
    .order("avatar_cached_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data?.avatar_path || !isFresh(data.avatar_cached_at)) return null;
  return data;
}
