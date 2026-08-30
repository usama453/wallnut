import { getProvider } from "./index";

export const WALLNUT_CHAT_FALLBACK =
  "Hey — I'm Wallnut. @mention me with a question, or send an image or PDF and I'll proof it for you.";

/** Casual Wallnut reply via the configured AI provider. */
export async function wallnutChatReply(message: string): Promise<string> {
  const trimmed = message.trim();
  if (!trimmed) return WALLNUT_CHAT_FALLBACK;
  try {
    const reply = (await getProvider().chat(trimmed)).trim();
    return reply || WALLNUT_CHAT_FALLBACK;
  } catch (err) {
    console.error(
      `[wallnut-chat] failed: ${err instanceof Error ? err.message : err}`,
    );
    return WALLNUT_CHAT_FALLBACK;
  }
}

/** Remove WhatsApp @phone and @wallnut mention tokens from inbound text. */
export function stripWhatsAppMentions(body: string): string {
  return body
    .replace(/@\d{6,}/g, " ")
    .replace(/@wallnut/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}
