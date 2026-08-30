/**
 * Baileys Bridge — WAHA-compatible WhatsApp HTTP API without a browser.
 *
 * Implements the subset of WAHA endpoints used by Wallnut:
 *
 *   POST /api/default/auth/request-code  {phoneNumber}        -> {code}
 *   GET  /api/sessions/default                               -> status JSON
 *   GET  /api/default/auth/qr                                -> QR image
 *   POST /api/sendText      {session, chatId, text}          -> {id}
 *   POST /api/sendButtons   {session, chatId, body, buttons[]} -> {id}
 *   GET  /api/files/:mediaId                                -> raw bytes
 *
 * Inbound messages use WAHA's `{event, session, payload}` webhook envelope.
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
const API_KEY = process.env.WAHA_API_KEY || "";
const SESSION = process.env.WAHA_SESSION || "default";
const WEBHOOK_URL =
  process.env.WEBHOOK_URL || "http://localhost:3000/api/whatsapp/webhook";
// Base URL used in media links returned to the app (must be reachable FROM the app).
const MEDIA_BASE_URL = process.env.MEDIA_BASE_URL || `http://localhost:${PORT}`;
const WALLNUT_CONTACT_EMAIL = process.env.WALLNUT_CONTACT_EMAIL || "hey@usama.fun";
const WALLNUT_SITE_URL = process.env.WALLNUT_SITE_URL || "https://usama.fun/wallnut/";
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
let reconnectTimer = null;
let startingPromise = null;
let freshPairingPromise = null;
let freshPairingAttempts = 0;
let socketGeneration = 0;
/** mediaId -> {buffer, mimetype, filename} */
const mediaStore = new Map();
/** WhatsApp contacts seen this session (jid -> { id, name, notify }). */
const contactBook = new Map();
/** Profile picture cache: jid -> { buffer, mimetype, at }. */
const pictureCache = new Map();
const PICTURE_TTL_MS = 6 * 60 * 60 * 1000;
/** msgId -> original WAMessage, kept so outbound sends can quote-reply. */
const msgCache = new Map();
const MSG_CACHE_MAX = 300;
/** Privacy @lid JID -> routable phone JID learned from group rosters. */
const lidToPhone = new Map();
/** chat jid -> disappearing duration in seconds (0 = off). */
const ephemeralByChat = new Map();
const EPHEMERAL_CACHE_MAX = 500;
const WA_DEFAULT_EPHEMERAL = 7 * 24 * 60 * 60;
const EPHEMERAL_SETTING_PROTOCOL_TYPE = 3;

function cacheMessage(m) {
  const id = m?.key?.id;
  if (!id) return;
  msgCache.set(id, m);
  noteEphemeralFromMessage(m);
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

function rememberContacts(contacts) {
  if (!Array.isArray(contacts)) return;
  for (const contact of contacts) {
    const id = contact?.id;
    if (!id) continue;
    const previous = contactBook.get(id) || { id };
    const name = contact.name || contact.notify || contact.verifiedName || previous.name;
    const notify = contact.notify || contact.pushname || previous.notify;
    contactBook.set(id, { id, name: name || notify, notify: notify || name });
    const digits = digitsOf(id);
    if (digits) contactBook.set(`${digits}@s.whatsapp.net`, contactBook.get(id));
    if (digits) contactBook.set(`${digits}@c.us`, contactBook.get(id));
  }
}

function contactNameFor(jid, pushName) {
  const remembered = contactBook.get(jid) || contactBook.get(normalizeJid(jid));
  return (
    pushName ||
    remembered?.name ||
    remembered?.notify ||
    null
  );
}

function participantJid(participant) {
  const candidates = [participant?.phoneNumber, participant?.jid, participant?.id]
    .filter(Boolean)
    .map(String);
  return (
    candidates.find((id) => id.endsWith("@s.whatsapp.net") || id.endsWith("@c.us")) ||
    candidates[0] ||
    ""
  );
}

function participantLid(participant) {
  const candidates = [participant?.lid, participant?.id, participant?.jid, participant?.phoneNumber]
    .filter(Boolean)
    .map(String);
  return candidates.find((id) => id.endsWith("@lid")) || null;
}

function rememberParticipantIdentity(participant) {
  const phone = participantJid(participant);
  const lid = participantLid(participant);
  const name = participant.name || participant.notify || null;
  if (phone) {
    rememberContacts([{ id: phone, notify: participant.notify, name }]);
  }
  if (lid) {
    rememberContacts([{ id: lid, notify: participant.notify, name }]);
    if (phone && lid !== phone) {
      lidToPhone.set(lid, phone);
      const lidDigits = digitsOf(lid);
      const phoneDigits = digitsOf(phone);
      if (lidDigits && phoneDigits) lidToPhone.set(lidDigits, phone);
    }
  }
}

function resolveSenderPhone(participantJidValue) {
  if (!participantJidValue) return null;
  const direct = lidToPhone.get(participantJidValue);
  if (direct) return direct;
  const digits = digitsOf(participantJidValue);
  if (digits && lidToPhone.has(digits)) return lidToPhone.get(digits);
  if (
    participantJidValue.endsWith("@s.whatsapp.net") ||
    participantJidValue.endsWith("@c.us")
  ) {
    return participantJidValue;
  }
  return null;
}

function groupParticipantsPayload(group) {
  return (group.participants || [])
    .map((participant) => {
      rememberParticipantIdentity(participant);
      const id = participantJid(participant);
      const lid = participantLid(participant);
      if (!id) return null;
      const remembered = lookupContact(id);
      return {
        id,
        lid: lid && lid !== id ? lid : null,
        jid: participant.jid || null,
        phoneNumber: participant.phoneNumber || null,
        admin: participant.admin || null,
        name: remembered.name || remembered.notify || participant.notify || participant.name || null,
      };
    })
    .filter(Boolean);
}

function lookupContact(rawId) {
  const jid = normalizeJid(rawId);
  const digits = digitsOf(jid);
  return (
    contactBook.get(rawId) ||
    contactBook.get(jid) ||
    contactBook.get(`${digits}@s.whatsapp.net`) ||
    contactBook.get(`${digits}@c.us`) ||
    { id: jid, name: null, notify: null }
  );
}

async function profilePictureFor(rawId) {
  if (!sock || status !== "WORKING") return null;
  for (const jid of profilePictureCandidates(rawId)) {
    const cached = pictureCache.get(jid);
    if (cached && Date.now() - cached.at < PICTURE_TTL_MS) return cached;
    try {
      const url = await sock.profilePictureUrl(jid, "image");
      if (!url) continue;
      const response = await fetch(url);
      if (!response.ok) continue;
      const buffer = Buffer.from(await response.arrayBuffer());
      const mimetype = response.headers.get("content-type") || "image/jpeg";
      const entry = { buffer, mimetype, at: Date.now() };
      pictureCache.set(jid, entry);
      return entry;
    } catch {
      // Try the next JID variant.
    }
  }
  return null;
}

function profilePictureCandidates(rawId) {
  const seen = new Set();
  const out = [];
  const push = (value) => {
    const jid = String(value || "").trim();
    if (!jid || seen.has(jid)) return;
    seen.add(jid);
    out.push(jid);
  };

  const raw = String(rawId || "").trim();
  push(raw.includes("@") ? raw : normalizeJid(raw));

  const digits = digitsOf(raw);
  if (digits) {
    push(`${digits}@s.whatsapp.net`);
    push(`${digits}@c.us`);
    push(`${digits}@lid`);
    for (const key of [raw, `${digits}@s.whatsapp.net`, `${digits}@c.us`, `${digits}@lid`]) {
      const remembered = contactBook.get(key);
      if (remembered?.id) push(remembered.id);
    }
  }

  return out;
}

function wallnutBusinessDescription() {
  return [
    "Hi! I'm Wallnut 🦆",
    "",
    "Drop me whatever you need proofed, image or PDF. I'll take it from there.",
    "",
    "🚧 In demo mode currently.",
    "",
    "Want me in a group chat?",
    WALLNUT_SITE_URL,
    "",
    "Get in touch",
    WALLNUT_CONTACT_EMAIL,
  ].join("\n");
}

async function syncWallnutBusinessProfile(socket) {
  if (typeof socket.updateBussinesProfile !== "function") return;
  try {
    await socket.updateBussinesProfile({
      description: wallnutBusinessDescription(),
      email: WALLNUT_CONTACT_EMAIL,
      websites: [WALLNUT_SITE_URL],
    });
    console.log(`[bridge] business profile synced (contact ${WALLNUT_CONTACT_EMAIL})`);
  } catch (err) {
    console.warn(
      "[bridge] business profile sync failed:",
      err?.message || err,
    );
  }
}

function digitsOf(jid) {
  return String(jid).split("@")[0].replace(/[^0-9]/g, "");
}

async function startSocket() {
  if (startingPromise) return startingPromise;
  startingPromise = createSocket();
  try {
    return await startingPromise;
  } finally {
    startingPromise = null;
  }
}

async function createSocket() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  const generation = ++socketGeneration;
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();
  const nextSocket = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger: log,
    markOnlineOnConnect: false,
    syncFullHistory: false,
  });
  sock = nextSocket;

  nextSocket.ev.on("creds.update", (update) => {
    if (generation === socketGeneration) return saveCreds(update);
  });

  nextSocket.ev.on("connection.update", async (update) => {
    if (generation !== socketGeneration) return;
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      latestQr = qr;
      status = "SCAN_QR_CODE";
      freshPairingAttempts = 0;
      console.log(
        `[bridge] QR received — scan /api/${SESSION}/auth/qr or use the pairing-code endpoint.`,
      );
    }
    if (connection === "connecting") {
      // Only advertise SCAN_QR_CODE once a QR actually exists. Otherwise the
      // Connect page shows "QR code is loading…" forever.
      if (!latestQr) status = "STARTING";
      console.log(`[bridge] connecting... status=${status}`);
    }
    if (connection === "open") {
      status = "WORKING";
      latestQr = null;
      freshPairingAttempts = 0;
      me = {
        id: nextSocket.user?.id || "",
        pushName: nextSocket.user?.name || undefined,
      };
      console.log(`[bridge] connected as +${digitsOf(me.id)}`);
      syncWallnutBusinessProfile(nextSocket).catch(() => {});
    }
    if (connection === "close") {
      me = null;
      const code = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;
      status = loggedOut ? "STOPPED" : "FAILED";
      console.log(`[bridge] closed (${code}) loggedOut=${loggedOut}`);
      if (loggedOut) {
        if (freshPairingAttempts >= 2) {
          console.error("[bridge] still logged out after clearing session; waiting for Start");
          return;
        }
        freshPairingAttempts += 1;
        console.log("[bridge] WhatsApp logged out — clearing session for a new QR");
        beginFreshPairing().catch((err) => {
          console.error("[bridge] fresh pairing failed:", err?.message || err);
        });
      } else {
        console.log("[bridge] reconnecting in 5s...");
        scheduleReconnect();
      }
    }
  });

  nextSocket.ev.on("contacts.upsert", (contacts) => {
    if (generation !== socketGeneration) return;
    rememberContacts(contacts);
  });
  nextSocket.ev.on("contacts.update", (contacts) => {
    if (generation !== socketGeneration) return;
    rememberContacts(contacts);
  });

  nextSocket.ev.on("groups.update", (groups) => {
    if (generation !== socketGeneration) return;
    for (const group of groups || []) {
      if (group?.id && group.ephemeralDuration) {
        rememberEphemeralForChat(group.id, group.ephemeralDuration);
      }
    }
  });

  nextSocket.ev.on("messages.upsert", async ({ type, messages }) => {
    if (generation !== socketGeneration) return;
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

function scheduleReconnect() {
  if (reconnectTimer || status === "STOPPED") return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    startSocket().catch((err) => {
      console.error("[bridge] reconnect failed:", err?.message || err);
      status = "FAILED";
      scheduleReconnect();
    });
  }, 5000);
}

function clearAuthFiles() {
  // Delete files inside the auth dir — never the directory itself. Production
  // mounts a Docker volume at AUTH_DIR, so rmdir(AUTH_DIR) fails with EBUSY
  // and the dead credentials stay on disk.
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  for (const name of fs.readdirSync(AUTH_DIR)) {
    fs.rmSync(path.join(AUTH_DIR, name), { recursive: true, force: true });
  }
}

async function closeCurrentSocket(reason) {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  const previous = sock;
  ++socketGeneration;
  sock = null;
  me = null;
  latestQr = null;
  try {
    previous?.end?.(new Error(reason));
  } catch {
    // The old socket may already be closed.
  }
}

async function beginFreshPairing() {
  if (freshPairingPromise) return freshPairingPromise;
  freshPairingPromise = (async () => {
    if (startingPromise) {
      try {
        await startingPromise;
      } catch {
        // Credentials are removed below even if startup failed.
      }
    }
    await closeCurrentSocket("Fresh pairing");
    try {
      clearAuthFiles();
    } catch (err) {
      console.error("[bridge] could not clear session files:", err?.message || err);
    }
    status = "STARTING";
    await startSocket();
  })();
  try {
    await freshPairingPromise;
  } finally {
    freshPairingPromise = null;
  }
}

async function restartSocket() {
  if (startingPromise) {
    try {
      await startingPromise;
    } catch {
      // Continue with a clean socket after a failed start.
    }
  }
  await closeCurrentSocket("Manual restart");
  status = "STARTING";
  await startSocket();
}

async function resetPairing() {
  const previous = sock;
  try {
    if (previous?.logout) {
      await Promise.race([
        previous.logout(),
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ]);
    }
  } catch (err) {
    console.warn("[bridge] remote logout failed; clearing local session:", err?.message || err);
  }
  await beginFreshPairing();
}

/* ------------------------------------------------------------------ */
/* Inbound mapping: Baileys message -> Wallnut waha-mode event         */
/* ------------------------------------------------------------------ */

function extractQuotedBody(quoted) {
  if (!quoted) return { body: "", hasMedia: false };
  const inner =
    quoted.ephemeralMessage?.message ||
    quoted.viewOnceMessage?.message ||
    quoted.documentWithCaptionMessage?.message ||
    quoted;
  if (inner.conversation) return { body: inner.conversation, hasMedia: false };
  if (inner.extendedTextMessage?.text) {
    return { body: inner.extendedTextMessage.text, hasMedia: false };
  }
  if (inner.imageMessage) {
    return { body: inner.imageMessage.caption || "", hasMedia: true };
  }
  if (inner.documentMessage) {
    return { body: inner.documentMessage.caption || "", hasMedia: true };
  }
  if (inner.videoMessage) {
    return { body: inner.videoMessage.caption || "", hasMedia: true };
  }
  return { body: "", hasMedia: Boolean(Object.keys(inner).length) };
}

function resolveQuotedContext(inner) {
  const contextInfo =
    inner.extendedTextMessage?.contextInfo ||
    inner.imageMessage?.contextInfo ||
    inner.documentMessage?.contextInfo ||
    inner.videoMessage?.contextInfo ||
    null;
  if (!contextInfo) return null;

  let { body, hasMedia } = extractQuotedBody(contextInfo.quotedMessage);

  if (!body && !hasMedia && contextInfo.stanzaId) {
    const cached = msgCache.get(contextInfo.stanzaId);
    if (cached?.message) {
      const extracted = extractQuotedBody(cached.message);
      body = extracted.body;
      hasMedia = extracted.hasMedia;
    }
  }

  if (!body && !hasMedia && !contextInfo.stanzaId) return null;

  return {
    body,
    stanzaId: contextInfo.stanzaId || null,
    participant: contextInfo.participant || null,
    hasMedia,
  };
}

function mapMessage(m) {
  const jid = m.key.remoteJid;
  if (!jid || jid === "status@broadcast") return null;
  const id = m.key.id || crypto.randomUUID();
  const content = m.message || {};
  const inner =
    content.ephemeralMessage?.message ||
    content.viewOnceMessage?.message ||
    content.documentWithCaptionMessage?.message ||
    content;

  let type = "text";
  let body = "";
  let hasMedia = false;
  let media = null;
  let selectedButtonId = null;
  const mentions =
    inner.extendedTextMessage?.contextInfo?.mentionedJid ||
    inner.imageMessage?.contextInfo?.mentionedJid ||
    inner.documentMessage?.contextInfo?.mentionedJid ||
    [];

  if (inner.conversation || inner.extendedTextMessage?.text) {
    body = inner.conversation || inner.extendedTextMessage.text;
  } else if (inner.imageMessage) {
    const mediaId = storeMedia(inner.imageMessage, "imageMessage", m);
    type = "image";
    body = inner.imageMessage.caption || "";
    hasMedia = true;
    media = {
      url: `${MEDIA_BASE_URL}/api/files/${mediaId}`,
      mimetype: inner.imageMessage.mimetype || "image/jpeg",
      filename: null,
      error: null,
    };
  } else if (inner.documentMessage) {
    const mime = inner.documentMessage.mimetype || "";
    const mediaId = storeMedia(inner.documentMessage, "documentMessage", m);
    type = "document";
    body = inner.documentMessage.caption || "";
    hasMedia = true;
    media = {
      url: `${MEDIA_BASE_URL}/api/files/${mediaId}`,
      mimetype: mime,
      filename: inner.documentMessage.fileName || null,
      error: null,
    };
  } else if (inner.buttonsResponseMessage) {
    type = "buttons_response";
    selectedButtonId = inner.buttonsResponseMessage.selectedButtonId || "";
    body = inner.buttonsResponseMessage.selectedDisplayText || "";
  } else if (inner.templateButtonReplyMessage) {
    type = "buttons_response";
    selectedButtonId = inner.templateButtonReplyMessage.selectedId || "";
    body = inner.templateButtonReplyMessage.selectedDisplayText || "";
  } else if (inner.listResponseMessage) {
    type = "list_response";
    selectedButtonId =
      inner.listResponseMessage.singleSelectReply?.selectedRowId || "";
    body = inner.listResponseMessage.title || "";
  }

  if (!body && !hasMedia && !selectedButtonId) return null;

  const personJid = m.key.participant || jid;
  const pushName = m.pushName || m.verifiedBizName || null;
  if (pushName) rememberContacts([{ id: personJid, notify: pushName }]);
  const senderPhone = resolveSenderPhone(m.key.participant);

  const quotedMessage = resolveQuotedContext(inner);

  return {
    event: "message",
    session: SESSION,
    engine: "BAILEYS",
    me,
    payload: {
      id,
      timestamp: Number(m.messageTimestamp || Math.floor(Date.now() / 1000)),
      from: jid,
      fromMe: false,
      source: "app",
      body,
      type,
      hasMedia,
      media,
      mentions,
      ...(quotedMessage ? { quotedMessage } : {}),
      _data: { notifyName: pushName },
      notifyName: contactNameFor(personJid, pushName),
      pushName: contactNameFor(personJid, pushName),
      ...(m.key.participant ? { participant: m.key.participant } : {}),
      ...(senderPhone ? { senderPhone } : {}),
      ...(selectedButtonId ? { selectedButtonId } : {}),
    },
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
/* Disappearing messages                                               */
/* ------------------------------------------------------------------ */

function rememberEphemeralForChat(jid, seconds) {
  if (!jid) return;
  const normalized = jid.includes("@") ? jid : normalizeJid(jid);
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) {
    ephemeralByChat.delete(normalized);
    ephemeralByChat.delete(jid);
    return;
  }
  ephemeralByChat.set(normalized, value);
  if (jid !== normalized) ephemeralByChat.set(jid, value);
  if (ephemeralByChat.size > EPHEMERAL_CACHE_MAX) {
    const oldest = ephemeralByChat.keys().next().value;
    if (oldest) ephemeralByChat.delete(oldest);
  }
}

function expirationFromContextInfo(contextInfo) {
  if (!contextInfo) return null;
  const direct = Number(contextInfo.expiration);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const mode = contextInfo.disappearingMode;
  if (mode) {
    const fromMode = Number(mode.ephemeralExpiration ?? mode.duration);
    if (Number.isFinite(fromMode) && fromMode > 0) return fromMode;
  }
  return null;
}

function unwrapMessageContent(content) {
  if (!content) return {};
  return (
    content.ephemeralMessage?.message ||
    content.viewOnceMessage?.message ||
    content.documentWithCaptionMessage?.message ||
    content
  );
}

function expirationFromMessageContent(content) {
  if (!content) return null;

  const protocol = content.protocolMessage;
  if (
    protocol &&
    (protocol.type === EPHEMERAL_SETTING_PROTOCOL_TYPE ||
      protocol.type === "EPHEMERAL_SETTING")
  ) {
    return Number(protocol.ephemeralExpiration) || 0;
  }

  const inner = unwrapMessageContent(content);
  const parts = [
    inner.extendedTextMessage,
    inner.imageMessage,
    inner.documentMessage,
    inner.videoMessage,
    inner.buttonsResponseMessage,
    inner.conversation ? inner : null,
  ];
  for (const part of parts) {
    const exp = expirationFromContextInfo(part?.contextInfo);
    if (exp) return exp;
  }

  if (content.ephemeralMessage) return WA_DEFAULT_EPHEMERAL;
  return null;
}

function noteEphemeralFromMessage(m) {
  const jid = m?.key?.remoteJid;
  if (!jid) return;
  const expiration = expirationFromMessageContent(m.message || {});
  if (expiration === null) return;
  rememberEphemeralForChat(jid, expiration);
}

async function resolveEphemeralExpiration(jid, quoted) {
  const normalized = normalizeJid(jid);

  if (quoted) {
    const fromQuoted = expirationFromMessageContent(quoted.message || {});
    if (fromQuoted && fromQuoted > 0) {
      rememberEphemeralForChat(normalized, fromQuoted);
      return fromQuoted;
    }
  }

  const cached = ephemeralByChat.get(normalized) || ephemeralByChat.get(jid);
  if (cached) return cached;

  if (normalized.endsWith("@g.us") && sock?.groupMetadata) {
    try {
      const meta = await sock.groupMetadata(normalized);
      if (meta?.ephemeralDuration) {
        rememberEphemeralForChat(normalized, meta.ephemeralDuration);
        return meta.ephemeralDuration;
      }
    } catch (err) {
      console.warn("[bridge] groupMetadata for ephemeral failed:", err?.message || err);
    }
  }

  return undefined;
}

function buildSendOptions(quoted, ephemeralExpiration) {
  const opts = {};
  if (quoted) opts.quoted = quoted;
  if (ephemeralExpiration) opts.ephemeralExpiration = ephemeralExpiration;
  return Object.keys(opts).length ? opts : undefined;
}

/* ------------------------------------------------------------------ */
/* Outbound helpers                                                    */
/* ------------------------------------------------------------------ */

async function sendText(chatId, text, quotedId) {
  const jid = normalizeJid(chatId);
  const quoted = quotedId ? msgCache.get(String(quotedId)) : undefined;
  const ephemeralExpiration = await resolveEphemeralExpiration(jid, quoted);
  const result = await sock.sendMessage(
    jid,
    { text },
    buildSendOptions(quoted, ephemeralExpiration),
  );
  return result?.key?.id || crypto.randomUUID();
}

async function sendButtons(chatId, body, buttons, quotedId) {
  const jid = normalizeJid(chatId);
  const quoted = quotedId ? msgCache.get(String(quotedId)) : undefined;
  const ephemeralExpiration = await resolveEphemeralExpiration(jid, quoted);
  const opts = buildSendOptions(quoted, ephemeralExpiration);
  const replyButtons = buttons.filter(
    (b) => b.type !== "url" && (b.text || b.title),
  );
  const urlButtons = buttons.filter((b) => b.type === "url" && b.url);

  // URL buttons aren't reliably supported by the buttons proto — append links.
  let fullBody = body;
  for (const u of urlButtons) {
    if (u.url) fullBody += `\n${u.url}`;
  }

  if (replyButtons.length > 0) {
    try {
      const result = await sock.sendMessage(
        jid,
        {
          text: fullBody,
          buttons: replyButtons.slice(0, 3).map((b) => ({
            buttonId: b.id,
            buttonText: { displayText: b.text || b.title },
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
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": API_KEY,
        },
        body,
      });
      console.log(
        `[bridge] webhook ${res.status} for msg from=${event.payload?.from} type=${event.payload?.type}`,
      );
      if (res.ok) return;
      lastError = new Error(`webhook returned ${res.status}`);
    } catch (err) {
      lastError = err;
    }
    if (attempt < 4) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** (attempt - 1)));
    }
  }
  throw lastError || new Error("webhook delivery failed");
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
      config: {
        webhooks: [{ url: WEBHOOK_URL, events: ["message"] }],
      },
      me,
      engine: { engine: "BAILEYS", state: status === "WORKING" ? "CONNECTED" : "UNPAIRED" },
    });
  }

  if (
    req.method === "GET" &&
    url.pathname === `/api/${encodeURIComponent(SESSION)}/auth/qr`
  ) {
    if (!latestQr) return json(res, 404, { message: `no qr available (status=${status})` });
    const format = url.searchParams.get("format");
    const acceptsPng = String(req.headers.accept || "").includes("image/png");
    if (format === "image" || acceptsPng) {
      const png = await QRCode.toBuffer(latestQr, { width: 400 });
      res.writeHead(200, { "content-type": "image/png" });
      return res.end(png);
    }
    if (format === "raw") return json(res, 200, { value: latestQr });
    return json(res, 200, { qr: latestQr });
  }

  if (req.method === "POST" && url.pathname === `/api/sessions/${SESSION}/start`) {
    if (status === "STOPPED") await beginFreshPairing();
    else if (!sock || status === "FAILED") await startSocket();
    return json(res, 201, { name: SESSION, status });
  }

  if (req.method === "POST" && url.pathname === `/api/sessions/${SESSION}/restart`) {
    await restartSocket();
    return json(res, 201, { name: SESSION, status });
  }

  if (req.method === "POST" && url.pathname === `/api/sessions/${SESSION}/logout`) {
    await resetPairing();
    return json(res, 201, { name: SESSION, status });
  }

  if (
    req.method === "POST" &&
    url.pathname === `/api/${encodeURIComponent(SESSION)}/auth/request-code`
  ) {
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
      const id = await sendText(
        body.chatId,
        body.text ?? body.body ?? "",
        body.reply_to ?? body.replyToMessageId,
      );
      return json(res, 200, { id });
    } catch (err) {
      return json(res, 502, { message: err?.message || String(err) });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/sendButtons") {
    const body = await readBody(req);
    if (status !== "WORKING") return json(res, 500, { message: `not connected (${status})` });
    try {
      const id = await sendButtons(
        body.chatId,
        body.body || "",
        body.buttons || [],
        body.reply_to ?? body.replyToMessageId,
      );
      return json(res, 200, { id });
    } catch (err) {
      return json(res, 502, { message: err?.message || String(err) });
    }
  }

  if (
    req.method === "GET" &&
    url.pathname.startsWith(`/api/${encodeURIComponent(SESSION)}/groups/`)
  ) {
    if (status !== "WORKING") {
      return json(res, 500, { message: `not connected (${status})` });
    }
    const groupId = decodeURIComponent(url.pathname.split("/").pop());
    try {
      const group = await sock.groupMetadata(groupId);
      return json(res, 200, {
        id: group.id,
        subject: group.subject,
        description: group.desc,
        participants: groupParticipantsPayload(group),
      });
    } catch (err) {
      return json(res, 404, { message: err?.message || "group not found" });
    }
  }

  const contactPrefix = `/api/${encodeURIComponent(SESSION)}/contacts/`;
  if (req.method === "GET" && url.pathname.startsWith(contactPrefix)) {
    const rest = url.pathname.slice(contactPrefix.length);
    const [contactId, extra] = rest.split("/");
    if (!contactId) return json(res, 404, { message: "contact not found" });
    const decoded = decodeURIComponent(contactId);
    if (extra === "profile-picture") {
      const picture = await profilePictureFor(decoded);
      if (!picture) return json(res, 404, { message: "no profile picture" });
      res.writeHead(200, {
        "content-type": picture.mimetype,
        "cache-control": "private, max-age=3600",
      });
      return res.end(picture.buffer);
    }
    if (extra) return json(res, 404, { message: `no route: ${req.method} ${url.pathname}` });
    const contact = lookupContact(decoded);
    return json(res, 200, {
      id: contact.id,
      name: contact.name || contact.notify || null,
    });
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

if (require.main === module) {
  if (!API_KEY) {
    console.error("[bridge] WAHA_API_KEY is required");
    process.exit(1);
  }
  server.listen(PORT, () => {
    console.log(`[bridge] listening on http://localhost:${PORT}`);
    startSocket().catch((err) => {
      console.error("[bridge] startup failed:", err);
      status = "FAILED";
      scheduleReconnect();
    });
  });
}

module.exports = {
  mapMessage,
  normalizeJid,
  expirationFromMessageContent,
  noteEphemeralFromMessage,
  rememberEphemeralForChat,
  buildSendOptions,
  server,
};
