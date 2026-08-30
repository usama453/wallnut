/** Digits-only form used to match JIDs, usage rows, and contact keys. */
export function phoneDigits(raw: string | null | undefined) {
  if (!raw) return "";
  return raw.split("@")[0].split(":")[0].replace(/\D/g, "");
}

export function isLidJid(raw: string | null | undefined): boolean {
  return Boolean(raw?.trim().endsWith("@lid"));
}

export function isUserPhoneJid(raw: string | null | undefined): boolean {
  const value = raw?.trim() ?? "";
  return value.endsWith("@c.us") || value.endsWith("@s.whatsapp.net");
}

export function looksLikeMobilePhoneDigits(digits: string): boolean {
  return digits.length >= 10 && digits.length <= 15;
}

/** Prefer a routable phone JID over WhatsApp's privacy @lid ids. */
export function preferParticipantPhone(participant: {
  id?: string | null;
  jid?: string | null;
  phoneNumber?: string | null;
}): string {
  const candidates = [participant.phoneNumber, participant.jid, participant.id]
    .filter(Boolean)
    .map(String);
  return (
    candidates.find(
      (id) => id.endsWith("@s.whatsapp.net") || id.endsWith("@c.us"),
    ) ||
    candidates[0] ||
    ""
  );
}

/** Privacy @lid JID when WAHA exposes it alongside a phone number. */
export function participantLidJid(participant: {
  id?: string | null;
  jid?: string | null;
  phoneNumber?: string | null;
  lid?: string | null;
}): string | null {
  const candidates = [participant.lid, participant.id, participant.jid, participant.phoneNumber]
    .filter(Boolean)
    .map(String);
  return candidates.find((id) => id.endsWith("@lid")) ?? null;
}

/** Contact id for the avatar proxy (full JID or bare phone digits). */
export function whatsappAvatarContact(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const value = raw.trim();
  if (value.includes("@")) return value;
  const digits = phoneDigits(value);
  return digits || null;
}

/** Resolve a contact id to the JID the bridge should query. */
export function whatsappAvatarJid(contact: string): string {
  const value = contact.trim();
  if (value.includes("@")) return value;
  const digits = phoneDigits(value);
  return `${digits}@s.whatsapp.net`;
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
