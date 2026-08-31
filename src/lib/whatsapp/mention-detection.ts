/** Digits-only id from a WhatsApp JID, LID, or @mention token. */
export function jidDigits(value: string): string {
  return value.split("@")[0].split(":")[0].replace(/\D/g, "");
}

function idsMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  return a.endsWith(b.slice(-10)) || b.endsWith(a.slice(-10));
}

export interface BotMentionMessage {
  text?: { body?: string };
  mentions?: string[];
  botId?: string;
  botLid?: string;
}

/**
 * True when a group message @mentions the bot. WhatsApp often shows a privacy
 * LID (e.g. @187544780189853) instead of the phone number, so we match phone,
 * LID, structured mention JIDs, and @wallnut.
 */
export function wasBotMentioned(
  message: BotMentionMessage,
  botPhoneNumber: string,
  botLidNumber = "",
): boolean {
  const body = message?.text?.body ?? "";
  if (/@wallnut\b/i.test(body)) return true;

  const botDigitIds = [
    botPhoneNumber,
    botLidNumber,
    message.botId,
    message.botLid,
  ]
    .filter(Boolean)
    .map((id) => jidDigits(String(id)))
    .filter(Boolean);
  const uniqueBotIds = [...new Set(botDigitIds)];

  const mentions = Array.isArray(message.mentions)
    ? message.mentions.map(String)
    : [];
  const bodyTokens = body.match(/@([0-9]{6,})/g) ?? [];

  for (const mention of mentions) {
    const digits = jidDigits(mention);
    if (uniqueBotIds.some((bot) => idsMatch(digits, bot))) return true;
  }

  for (const token of bodyTokens) {
    const digits = jidDigits(token);
    if (uniqueBotIds.some((bot) => idsMatch(digits, bot))) return true;
  }

  if (!uniqueBotIds.length && (mentions.length > 0 || bodyTokens.length > 0)) {
    return true;
  }

  return false;
}
