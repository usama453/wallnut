import { createHmac, timingSafeEqual } from "crypto";

/** Verify the Meta webhook signature (X-Hub-Signature-256). */
export function verifySignature(rawBody: string, signature?: string | null): boolean {
  if (process.env.WHATSAPP_MOCK === "1") return true;
  if (!signature || !process.env.WHATSAPP_APP_SECRET) return false;

  const expected = createHmac("sha256", process.env.WHATSAPP_APP_SECRET)
    .update(rawBody)
    .digest("hex");
  const provided = signature.replace(/^sha256=/, "");

  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** True if the webhook event payload is a WhatsApp message event. */
export function isWhatsAppEvent(payload: any): boolean {
  return Array.isArray(payload?.entry) && payload.entry.length > 0;
}

export interface IncomingMedia {
  mediaId: string;
  mime: string;
  sha256?: string;
}

/** Extract an image/document media reference from an incoming message. */
export function extractMedia(message: any): IncomingMedia | null {
  if (!message) return null;

  if (message.type === "image" && message.image?.id) {
    return { mediaId: message.image.id, mime: message.image.mime_type ?? "image/jpeg" };
  }
  if (message.type === "document" && message.document?.id) {
    const mime = message.document.mime_type ?? "";
    if (mime === "application/pdf") {
      return { mediaId: message.document.id, mime };
    }
  }
  return null;
}

export function isButtonReply(message: any): boolean {
  return message?.type === "interactive" && message.interactive?.type === "button_reply";
}

export function getButtonReplyId(message: any): string | null {
  return message?.interactive?.button_reply?.id ?? null;
}

/** The destination phone number id for an inbound event (from metadata) —
 * used to pick the right business token in multi-tenant setups. */
export function extractPhoneNumberId(value: any): string | undefined {
  return value?.metadata?.phone_number_id ?? undefined;
}
