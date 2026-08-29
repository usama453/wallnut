/** Canonical id used for access-control rows and dashboard display. */
export function canonicalChatId(raw: string): string {
  const value = raw.trim();
  if (!value.includes("@")) {
    const digits = value.replace(/[^0-9]/g, "");
    return `${digits}@c.us`;
  }
  if (value.endsWith("@s.whatsapp.net")) {
    return `${value.slice(0, -"@s.whatsapp.net".length)}@c.us`;
  }
  return value;
}

/** Include the legacy bridge format that omitted the `@g.us` suffix. */
export function whatsappGroupIdVariants(groupId: string): string[] {
  const value = groupId.trim();
  const withoutSuffix = value.replace(/@g\.us$/, "");
  return Array.from(
    new Set([value, withoutSuffix, `${withoutSuffix}@g.us`]),
  ).filter(Boolean);
}
