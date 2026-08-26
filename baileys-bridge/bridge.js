/**
 * Baileys Bridge — WAHA-compatible WhatsApp HTTP API without a browser.
 *
 * Implements the subset of WAHA endpoints used by Wallnut's WhatsApp client
 * (src/lib/whatsapp/client.ts) so the Next.js app needs zero changes:
 *
 *   POST /api/default/auth/request-code  {phoneNumber}        -> {code}
 *   GET  /api/sessions/default                            -> status JSON
 *   POST /api/sendText      {session, chatId, text}       -> {id}
 *   POST /api/sendButtons   {session, chatId, body, buttons[]} -> {id}
 *   GET  /api/media/:mediaId                             -> {url, mimeType}
 *   GET  /api/files/:mediaId                             -> raw bytes
 *
 * Inbound messages are forwarded to WEBHOOK_URL as single-event payloads
 * shaped for src/app/api/whatsapp/webhook/route.ts (waha mode), including
 * the wallnut_wamode=waha cookie the mode detector expects.
 */
const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const pino = require("pino");
const QRCode = require("qrcode");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
} = require("@whiskeysockets/baileys");

const PORT = Number(process.env.BRIDGE_PORT || 3001);
const API_KEY = process.env.WAHA_API_KEY || "wallnut-waha-key-2026";
const SESSION = process.env.WAHA_SESSION || "default";
const WEBHOOK_URL =
  process.env.WEBHOOK_URL || "http://localhost:3000/api/whatsapp/webhook";
// Base URL used in media links returned to the app (must be reachable FROM the app).
const MEDIA_BASE_URL = process.env.MEDIA_BASE_URL || `http://localhost:${PORT}`;
const AUTH_DIR = path.join(__dirname, "session-data");
const log = pino({ level: process.env.LOG_LEVEL || "warn" });

// Baileys throws transient stream errors (Connection Closed, Precondition
// Required) as unhandled rejections during sync/reconnect. Keep the process
// alive — the socket's own reconnect logic recovers from these.
process.on("unhandledRejection", (reason) => {
  console.error("[bridge] unhandledRejection:", reason?.message || reason);
});
process.on("uncaughtException", (err) => {
  console.error("[bridge] uncaughtException:", err?.message || err);
});

let sock = null;
let status = "STARTING";
let me = null;
let latestQr = null;
let pairingCodePromise = null;
/** mediaId -> {buffer, mimetype, filename} */
const mediaStore = new Map();
/** msgId -> original WAMessage, kept so outbound sends can quote-reply. */
const msgCache = new Map();
const MSG_CACHE_MAX = 300;

function cacheMessage(m) {
  const id = m?.key?.id;
  if (!id) return;
  msgCache.set(id, m);
  if (msgCache.size > MSG_CACHE_MAX) {
    // Evict oldest entries (insertion order).
    const excess = msgCache.size - MSG_CACHE_MAX;
    let i = 0;
    for (const k of msgCache.keys()) {
      if (i++ >= excess) break;
      msgCache.delete(k);
    }
  }
}

function normalizeJid(chatId) {
  const s = String(chatId);
  // Already a full JID (@lid, @g.us, @s.whatsapp.net) — use verbatim so
  // replies route back exactly where the message came from.
  if (s.includes("@")) return s;
  const digits = s.replace(/[^0-9]/g, "");
  return `${digits}@s.whatsapp.net`;
}

function digitsOf(jid) {
  return String(jid).split("@")[0].replace(/[^0-9]/g, "");
}

async function startSocket() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();
  sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger: log,
    markOnlineOnConnect: false,
    syncFullHistory: false,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      latestQr = qr;
      console.log("[bridge] QR received — scan /api/default/auth/qr or use the pairing-code endpoint.");
    }
    if (connection === "connecting") {
      status = sock.authState.creds.registered ? "STARTING" : "SCAN_QR_CODE";
      console.log(`[bridge] connecting... status=${status}`);
    }
    if (connection === "open") {
      status = "WORKING";
      me = digitsOf(sock.user?.id || "");
      console.log(`[bridge] connected as +${me}`);
    }
    if (connection === "close") {
      me = null;
      const code = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;
      status = loggedOut ? "STOPPED" : "FAILED";
      console.log(`[bridge] closed (${code}) loggedOut=${loggedOut}`);
      if (!loggedOut) {
        console.log("[bridge] reconnecting in 5s...");
        setTimeout(startSocket, 5000);
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ type, messages }) => {
    if (type !== "notify") return;
    for (const m of messages) {
      try {
        await forwardMessage(m);
      } catch (err) {
        console.error("[bridge] forward error:", err?.message || err);
      }
    }
  });
}

/* ------------------------------------------------------------------ */
/* Inbound mapping: Baileys message -> Wallnut waha-mode event         */
/* ------------------------------------------------------------------ */

function mapMessage(m) {
  const jid = m.key.remoteJid;
  if (!jid || jid === "status@broadcast") return null;
  // Keep the full JID (phone @s.whatsapp.net OR new-style @lid) as `from`
  // so replies route back to the exact chat the message came from.
  const from = jid;
  const id = m.key.id || crypto.randomUUID();
  const content = m.message || {};
  // unwrap ephemeral/document wrappers
  const inner =
    content.ephemeralMessage?.message ||
    content.viewOnceMessage?.message ||
    content.documentWithCaptionMessage?.message ||
    content;

  let out = null;

  if (inner.conversation || inner.extendedTextMessage?.text) {
    out = {
      type: "text",
      text: { body: inner.conversation || inner.extendedTextMessage.text },
    };
  } else if (inner.imageMessage) {
    const mediaId = storeMedia(inner.imageMessage, "imageMessage", m);
    out = {
      type: "image",
      image: {
        id: mediaId,
        mime_type: inner.imageMessage.mimetype || "image/jpeg",
        caption: inner.imageMessage.caption || undefined,
      },
    };
  } else if (inner.documentMessage) {
    const mime = inner.documentMessage.mimetype || "";
    const mediaId = storeMedia(inner.documentMessage, "documentMessage", m);
    out = {
      type: "document",
      document: {
        id: mediaId,
        mime_type: mime,
        filename: inner.documentMessage.fileName || undefined,
      },
    };
  } else if (inner.buttonsResponseMessage) {
    out = {
      type: "interactive",
      interactive: {
        type: "button_reply",
        button_reply: {
          id: inner.buttonsResponseMessage.selectedButtonId || "",
          title: inner.buttonsResponseMessage.selectedDisplayText || "",
        },
      },
    };
  } else if (inner.templateButtonReplyMessage) {
    out = {
      type: "interactive",
      interactive: {
        type: "button_reply",
        button_reply: {
          id: inner.templateButtonReplyMessage.selectedId || "",
          title: inner.templateButtonReplyMessage.selectedDisplayText || "",
        },
      },
    };
  } else if (inner.listResponseMessage) {
    out = {
      type: "interactive",
      interactive: {
        type: "button_reply",
        button_reply: {
          id: inner.listResponseMessage.singleSelectReply?.selectedRowId || "",
          title: inner.listResponseMessage.title || "",
        },
      },
    };
  }

  if (!out) return null;

  const groupId = m.key.remoteJid?.endsWith("@g.us")
    ? m.key.remoteJid.split("@")[0]
    : undefined;

  return {
    from,
    id,
    // Group sender (JID of the participant) — undefined in 1:1 chats.
    ...(m.key.participant ? { participant: m.key.participant } : {}),
    ...out,
    ...(groupId ? { context: { group_id: groupId } } : {}),
    messages: [{ from, id, ...out }],
  };
}

function storeMedia(msg, protoName, m) {
  const mediaId = crypto.randomBytes(12).toString("hex");
  mediaStore.set(mediaId, {
    buffer: null,
    mimetype: msg.mimetype || "application/octet-stream",
    filename: msg.fileName || msg.caption || mediaId,
    protoName,
    protoRef: msg,
    remoteJid: m.key.remoteJid,
    stanzaId: m.key.id,
  });
  return mediaId;
}

async function downloadBaileysMedia(entry) {
  if (entry.buffer) return entry.buffer;
  const stub = {
    key: { remoteJid: entry.remoteJid, fromMe: false, id: entry.stanzaId },
    message: { [entry.protoName]: entry.protoRef },
  };
  entry.buffer = await downloadMediaMessage(
    stub,
    "buffer",
    {},
    { logger: log, reuploadRequest: sock.updateMediaMessage },
  );
  return entry.buffer;
}

/* ------------------------------------------------------------------ */
/* Outbound helpers                                                    */
/* ------------------------------------------------------------------ */

async function sendText(chatId, text, quotedId) {
  const jid = normalizeJid(chatId);
  const quoted = quotedId ? msgCache.get(String(quotedId)) : undefined;
  const result = await sock.sendMessage(jid, { text }, quoted ? { quoted } : undefined);
  return result?.key?.id || crypto.randomUUID();
}

async function sendButtons(chatId, body, buttons, quotedId) {
  const jid = normalizeJid(chatId);
  const quoted = quotedId ? msgCache.get(String(quotedId)) : undefined;
  const opts = quoted ? { quoted } : undefined;
  const replyButtons = buttons.filter((b) => b.type !== "url" && b.title);
  const urlButtons = buttons.filter((b) => b.type === "url" && b.url);

  // URL buttons aren't reliably supported by the buttons proto — append links.
  let fullBody = body;
  for (const u of urlButtons) fullBody += `\n${u.title}: ${u.url}`;

  if (replyButtons.length > 0) {
    try {
      const result = await sock.sendMessage(
        jid,
        {
          text: fullBody,
          buttons: replyButtons.slice(0, 3).map((b) => ({
            buttonId: b.id,
            buttonText: { displayText: b.title },
            type: 1,
          })),
          headerType: 1,
        },
        opts,
      );
      return result?.key?.id || crypto.randomUUID();
    } catch (err) {
      console.error("[bridge] native buttons failed, falling back to text:", err?.message);
    }
  }
  return sendText(chatId, fullBody, quotedId);
}

/* ------------------------------------------------------------------ */
/* Webhook forwarding                                                  */
/* ------------------------------------------------------------------ */

async function forwardToWebhook(event) {
  const body = JSON.stringify(event);
  const url = new URL(WEBHOOK_URL);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": API_KEY,
      "x-waha-signature": "baileys",
      cookie: "wallnut_wamode=waha",
    },
    body,
  });
  console.log(`[bridge] webhook ${res.status} for msg from=${event.messages?.[0]?.from} type=${event.messages?.[0]?.type}`);
}

async function forwardMessage(m) {
  if (m.key.fromMe) return;
  const mapped = mapMessage(m);
  if (!mapped) return;
  cacheMessage(m);
  await forwardToWebhook(mapped);
}

/* ------------------------------------------------------------------ */
/* HTTP server                                                         */
/* ------------------------------------------------------------------ */

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { "content-type": "application/json" });
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks);
  try {
    return JSON.parse(raw.toString("utf8") || "{}");
  } catch {
    return {};
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // Public like WAHA direct-media links: raw bytes keyed by an unguessable id.
  if (req.method === "GET" && url.pathname.startsWith("/api/files/")) {
    const mediaId = url.pathname.split("/").pop();
    const entry = mediaStore.get(mediaId);
    if (!entry) return json(res, 404, { message: "media not found" });
    try {
      const buffer = await downloadBaileysMedia(entry);
      res.writeHead(200, { "content-type": entry.mimetype });
      return res.end(buffer);
    } catch (err) {
      console.error("[bridge] media download failed:", err?.stack || err?.message || err);
      return json(res, 502, { message: err?.message || String(err) });
    }
  }

  const key = req.headers["x-api-key"];
  if (key !== API_KEY) return json(res, 401, { message: "Unauthorized" });

  // ---- session management ----
  if (req.method === "GET" && url.pathname === `/api/sessions/${SESSION}`) {
    return json(res, 200, {
      name: SESSION,
      status,
      config: {},
      me: me ? `${me}@s.whatsapp.net` : null,
      engine: { engine: "BAILEYS", state: status === "WORKING" ? "CONNECTED" : "UNPAIRED" },
    });
  }

  if (req.method === "GET" && url.pathname === "/api/default/auth/qr") {
    if (!latestQr) return json(res, 404, { message: `no qr available (status=${status})` });
    const format = url.searchParams.get("format");
    if (format === "image") {
      const png = await QRCode.toBuffer(latestQr, { width: 400 });
      res.writeHead(200, { "content-type": "image/png" });
      return res.end(png);
    }
    return json(res, 200, { qr: latestQr });
  }

  if (req.method === "POST" && url.pathname === `/api/sessions/${SESSION}/start`) {
    if (!sock || status === "STOPPED" || status === "FAILED") await startSocket();
    return json(res, 201, { name: SESSION, status });
  }

  if (req.method === "POST" && url.pathname === "/api/default/auth/request-code") {
    const body = await readBody(req);
    const phone = String(body.phoneNumber || "").replace(/[^0-9]/g, "");
    if (!phone) return json(res, 422, { message: "phoneNumber required" });
    if (status !== "SCAN_QR_CODE" && !sock?.authState?.creds?.registered) {
      return json(res, 500, { message: `socket not ready (status=${status})` });
    }
    try {
      if (!pairingCodePromise) pairingCodePromise = sock.requestPairingCode(phone);
      const code = await pairingCodePromise;
      pairingCodePromise = null;
      console.log(`[bridge] pairing code for +${phone}: ${code}`);
      return json(res, 200, { code });
    } catch (err) {
      pairingCodePromise = null;
      return json(res, 500, { message: err?.message || String(err) });
    }
  }

  // ---- sending ----
  if (req.method === "POST" && url.pathname === "/api/sendText") {
    const body = await readBody(req);
    if (status !== "WORKING") return json(res, 500, { message: `not connected (${status})` });
    try {
      const id = await sendText(body.chatId, body.text ?? body.body ?? "", body.replyToMessageId);
      return json(res, 200, { id });
    } catch (err) {
      return json(res, 502, { message: err?.message || String(err) });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/sendButtons") {
    const body = await readBody(req);
    if (status !== "WORKING") return json(res, 500, { message: `not connected (${status})` });
    try {
      const id = await sendButtons(body.chatId, body.body || "", body.buttons || [], body.replyToMessageId);
      return json(res, 200, { id });
    } catch (err) {
      return json(res, 502, { message: err?.message || String(err) });
    }
  }

  // ---- media ----
  if (req.method === "GET" && url.pathname.startsWith("/api/media/")) {
    const mediaId = url.pathname.split("/").pop();
    const entry = mediaStore.get(mediaId);
    if (!entry) return json(res, 404, { message: "media not found" });
    return json(res, 200, {
      url: `${MEDIA_BASE_URL}/api/files/${mediaId}`,
      mimeType: entry.mimetype,
    });
  }

  json(res, 404, { message: `no route: ${req.method} ${url.pathname}` });
});

server.listen(PORT, () => {
  console.log(`[bridge] listening on http://localhost:${PORT}`);
  startSocket().catch((err) => {
    console.error("[bridge] startup failed:", err);
    process.exit(1);
  });
});
