import { GRAPH_BASE } from "./config";
import { logUsage } from "./usage";
import type { WhatsAppConnection } from "./connection";
import { resolveConnection } from "./connection";

function legacyToken() {
  return process.env.WHATSAPP_TOKEN ?? "";
}
function legacyPhoneId() {
  return process.env.WHATSAPP_PHONE_ID ?? "";
}

/** Resolve a connection, defaulting to the legacy env credentials. */
async function getConnection(phoneNumberId?: string): Promise<{ token: string; phoneId: string }> {
  const conn = await resolveConnection(phoneNumberId);
  if (conn) return { token: conn.accessToken, phoneId: conn.phoneId };
  return { token: legacyToken(), phoneId: legacyPhoneId() };
}

/** Download media bytes from the Meta Graph API using the media id in a message. */
export async function downloadMedia(mediaId: string, phoneNumberId?: string): Promise<Buffer> {
  const { token } = await getConnection(phoneNumberId);
  const meta = await fetch(`${GRAPH_BASE}/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!meta.ok) throw new Error(`failed to fetch media info (${meta.status})`);
  const { url } = await meta.json();

  const file = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!file.ok) throw new Error(`failed to download media (${file.status})`);
  return Buffer.from(await file.arrayBuffer());
}

/** Send a plain text message. Returns the outbound message id. */
export async function sendText(
  to: string,
  text: string,
  groupId?: string,
  replyToMessageId?: string,
  phoneNumberId?: string,
): Promise<string> {
  return sendMessage(to, { type: "text", text: { body: text } }, groupId, replyToMessageId, phoneNumberId);
}

export interface Button {
  id: string;
  title: string;
}
export interface UrlButton {
  url: string;
  title: string;
}

/** Send an interactive message with up to 3 buttons (reply and/or url types). Returns the outbound message id. */
export async function sendInteractive(
  to: string,
  bodyText: string,
  buttons: { reply?: Button[]; url?: UrlButton[] },
  groupId?: string,
  replyToMessageId?: string,
  phoneNumberId?: string,
): Promise<string> {
  const payload: any[] = [];
  if (buttons.url) payload.push(...buttons.url.map((b) => ({ type: "cta_url", cta_url: { url: b.url, display_text: b.title } })));
  if (buttons.reply) payload.push(...buttons.reply.map((b) => ({ type: "reply", reply: b })));

  return sendMessage(
    to,
    {
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: bodyText.slice(0, 1024) },
        action: { buttons: payload.slice(0, 3) },
      },
    },
    groupId,
    replyToMessageId,
    phoneNumberId,
  );
}

async function sendMessage(
  to: string,
  content: any,
  groupId?: string,
  replyToMessageId?: string,
  phoneNumberId?: string,
): Promise<string> {
  const { token, phoneId } = await getConnection(phoneNumberId);
  const res = await fetch(`${GRAPH_BASE}/${phoneId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: groupId ? "group" : "individual",
      to: groupId ?? to,
      ...(replyToMessageId ? { context: { message_id: replyToMessageId } } : {}),
      ...content,
    }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`WhatsApp send failed (${res.status}): ${JSON.stringify(body).slice(0, 300)}`);
    console.error(`[whatsapp-send] ${err.message}`);
    throw err;
  }
  const msgId = body?.messages?.[0]?.id ?? "";
  console.log(`[whatsapp-send] ok to=${to} type=${content.type} msgId=${msgId || "?"}`);
  logUsage({
    direction: "outbound",
    msg_type: content.type === "interactive" ? "interactive" : "text",
    message_id: msgId || undefined,
    to_phone: groupId ? undefined : to,
    group_id: groupId,
    status: "accepted",
  });
  return msgId;
}

export type { WhatsAppConnection };
