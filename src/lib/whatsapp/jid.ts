/** Digits-only form used to match JIDs, usage rows, and contact keys. */
export function phoneDigits(raw: string | null | undefined) {
  if (!raw) return "";
  return raw.split("@")[0].split(":")[0].replace(/\D/g, "");
}
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

/** Match a WhatsApp group or 1:1 chat id across JID forms. */
export function whatsappChatIdVariants(chatId: string): string[] {
  const value = chatId.trim();
  if (value.endsWith("@g.us") || (!value.includes("@") && value.includes("-"))) {
    return whatsappGroupIdVariants(value);
  }
  const digits = phoneDigits(value);
  return Array.from(
    new Set(
      [
        value,
        canonicalChatId(value),
        digits ? `${digits}@c.us` : "",
        digits ? `${digits}@s.whatsapp.net` : "",
        digits ? `${digits}@lid` : "",
      ].filter(Boolean),
    ),
  );
}
