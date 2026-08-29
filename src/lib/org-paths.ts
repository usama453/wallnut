/** Shared catch-all workspace for 1:1 chats and unclaimed WhatsApp groups. */
export const PUBLIC_ORG_SLUG = "public";
export const LEGACY_PUBLIC_ORG_SLUG = "default";
export const ORG_COOKIE = "wallnut_org";

export function isPublicOrgSlug(slug: string | null | undefined) {
  const value = slug?.trim().toLowerCase();
  return value === PUBLIC_ORG_SLUG || value === LEGACY_PUBLIC_ORG_SLUG;
}

/** Static app routes that must never be treated as organization slugs. */
export const RESERVED_ORG_SLUGS = new Set([
  "api",
  "assets",
  "auth",
  "brand",
  "connect",
  "dashboard",
  "favicon.ico",
  "groups",
  "login",
  "nav",
  "r",
  "reports",
  "settings",
  "stats",
  "team",
  "terms",
  "upload",
  "usage",
]);

export function isReservedOrgSlug(slug: string) {
  return RESERVED_ORG_SLUGS.has(slug.trim().toLowerCase());
}

export function orgHomePath(slug: string) {
  return `/${encodeURIComponent(slug)}`;
}

export function orgLoginPath(slug: string, redirect = orgHomePath(slug)) {
  const url = new URL(`/login/${encodeURIComponent(slug)}`, "https://wallnut.local");
  url.searchParams.set("redirect", redirect);
  return `${url.pathname}${url.search}`;
}

export function orgGroupPath(slug: string, groupId: string) {
  return `/${encodeURIComponent(slug)}/groups/${encodeURIComponent(groupId)}`;
}

export function orgRankingsPath(slug: string) {
  return `/${encodeURIComponent(slug)}/rankings`;
}

export function unwrapRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}
