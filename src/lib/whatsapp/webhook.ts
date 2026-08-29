import { createHmac, timingSafeEqual } from "crypto";

export interface IncomingMedia {
  reference: string;
  mime: string;
  filename?: string | null;
}

interface WahaWebhookEnvelope {
  event?: string;
  session?: string;
  me?: { id?: string } | null;
  payload?: Record<string, any>;
}

/**
 * Convert WAHA's `{ event, session, payload }` envelope into the compact
 * message shape used by the proofing handler.
 */
export function extractWahaMessages(
  event: WahaWebhookEnvelope,
  expectedSession?: string,
): any[] {
  if (event?.event !== "message" && event?.event !== "message.any") return [];
  if (expectedSession && event.session && event.session !== expectedSession) return [];

  const payload = event.payload;
  if (!payload || payload.fromMe === true || payload.source === "api") return [];

  const from = firstString(
    payload.from,
    payload.chatId,
    payload._data?.id?.remote,
    payload._data?.key?.remoteJid,
  );
  if (!from) return [];

  const id = normalizeId(payload.id);
  const body = firstString(payload.body, payload.text) ?? "";
  const participant =
    firstString(
      payload.participant,
      payload.author,
      payload._data?.author,
      payload._data?.key?.participant,
    ) ?? from;
  const groupId = from.endsWith("@g.us") ? from : undefined;
  const buttonId = extractWahaButtonId(payload);
  const media = payload.media as
    | { url?: string | null; mimetype?: string; mimeType?: string; filename?: string | null }
    | null
    | undefined;
  const mime = media?.mimetype ?? media?.mimeType ?? "";

  const message: Record<string, any> = {
    id,
    from,
    sender: participant,
    botId: event.me?.id,
    mentions:
      payload.mentions ??
      payload._data?.message?.extendedTextMessage?.contextInfo?.mentionedJid ??
      [],
    type: "text",
    text: { body },
    context: groupId ? { group_id: groupId } : undefined,
  };

  if (buttonId) {
    message.type = "interactive";
    message.interactive = {
      type: "button_reply",
      button_reply: { id: buttonId },
    };
  } else if (payload.hasMedia && media?.url && mime.startsWith("image/")) {
    message.type = "image";
    message.image = {
      url: media.url,
      mime_type: mime,
      caption: body || undefined,
    };
  } else if (
    payload.hasMedia &&
    media?.url &&
    mime === "application/pdf"
  ) {
    message.type = "document";
    message.document = {
      url: media.url,
      mime_type: mime,
      filename: media.filename ?? undefined,
      caption: body || undefined,
    };
  } else if (payload.hasMedia) {
    message.type = "unsupported";
  }

  return [message];
}

/** Verify WAHA's X-Webhook-Hmac (SHA-512 over the raw request body). */
export function verifyWahaWebhookHmac(
  rawBody: string,
  signature: string | null,
  secret: string,
  algorithm: string | null,
): boolean {
  if (!signature || !secret || algorithm?.toLowerCase() !== "sha512") return false;
  const expected = createHmac("sha512", secret).update(rawBody).digest("hex");
  return constantTimeEqual(expected, signature);
}

/** Constant-time comparison for API keys and signatures. */
export function constantTimeEqual(expected: string, provided: string | null): boolean {
  if (!provided) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(provided);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function isWhatsAppEvent(payload: WahaWebhookEnvelope): boolean {
  return (
    (payload?.event === "message" || payload?.event === "message.any") &&
    Boolean(payload.payload)
  );
}

export function extractMedia(message: any): IncomingMedia | null {
  if (!message) return null;

  if (message.type === "image") {
    const reference = firstString(message.image?.url, message.image?.id);
    if (reference) {
      return {
        reference,
        mime: message.image?.mime_type ?? "image/jpeg",
      };
    }
  }

  if (message.type === "document") {
    const mime = message.document?.mime_type ?? "";
    const reference = firstString(message.document?.url, message.document?.id);
    if (reference && mime === "application/pdf") {
      return {
        reference,
        mime,
        filename: message.document?.filename ?? null,
      };
    }
  }

  return null;
}

export function isButtonReply(message: any): boolean {
  return (
    message?.type === "interactive" &&
    message.interactive?.type === "button_reply" &&
    Boolean(message.interactive?.button_reply?.id)
  );
}

export function getButtonReplyId(message: any): string | null {
  return message?.interactive?.button_reply?.id ?? null;
}

function extractWahaButtonId(payload: Record<string, any>): string | null {
  const direct = firstString(
    payload.selectedButtonId,
    payload.selectedButtonID,
    payload._data?.selectedButtonId,
    payload._data?.selectedButtonID,
    payload._data?.message?.buttonsResponseMessage?.selectedButtonId,
  );
  if (direct) return direct;

  const paramsJson =
    payload._data?.message?.interactiveResponseMessage?.nativeFlowResponseMessage
      ?.paramsJson;
  if (typeof paramsJson !== "string") return null;
  try {
    const params = JSON.parse(paramsJson);
    return (
      firstString(
        params.id,
        params.selectedButtonId,
        params.selectedButtonID,
        params.button_id,
      ) ?? null
    );
  } catch {
    return null;
  }
}

function normalizeId(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const id = value as { _serialized?: unknown; id?: unknown };
    return firstString(id._serialized, id.id) ?? "";
  }
  return "";
}

function firstString(...values: unknown[]): string | undefined {
  return values.find(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
}
