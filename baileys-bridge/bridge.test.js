process.env.WAHA_API_KEY = "bridge-test-key";
process.env.WEBHOOK_URL = "http://app:3000/api/whatsapp/webhook";

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { mapMessage, normalizeJid, expirationFromMessageContent, buildSendOptions, server } = require("./bridge");

let baseUrl;

before(
  () =>
    new Promise((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    }),
);

after(
  () =>
    new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    }),
);

test("maps a Baileys group text to a WAHA webhook", () => {
  const event = mapMessage({
    key: {
      id: "text-1",
      remoteJid: "120363000000@g.us",
      participant: "15551234567@s.whatsapp.net",
    },
    messageTimestamp: 123,
    message: {
      extendedTextMessage: {
        text: "WN-ABC234",
        contextInfo: { mentionedJid: ["15550000000@s.whatsapp.net"] },
      },
    },
  });

  assert.equal(event.event, "message");
  assert.equal(event.session, "default");
  assert.equal(event.payload.from, "120363000000@g.us");
  assert.equal(event.payload.participant, "15551234567@s.whatsapp.net");
  assert.equal(event.payload.body, "WN-ABC234");
  assert.equal(event.payload.hasMedia, false);
  assert.deepEqual(event.payload.mentions, ["15550000000@s.whatsapp.net"]);
});

test("maps image metadata and a downloadable URL", () => {
  const event = mapMessage({
    key: { id: "image-1", remoteJid: "15551234567@s.whatsapp.net" },
    messageTimestamp: 124,
    message: {
      imageMessage: {
        mimetype: "image/png",
        caption: "Homepage",
      },
    },
  });

  assert.equal(event.payload.type, "image");
  assert.equal(event.payload.body, "Homepage");
  assert.equal(event.payload.hasMedia, true);
  assert.equal(event.payload.media.mimetype, "image/png");
  assert.match(event.payload.media.url, /\/api\/files\/[a-f0-9]+$/);
});

test("includes WhatsApp push names on mapped messages", async () => {
  const event = mapMessage({
    key: {
      id: "name-1",
      remoteJid: "120363000000@g.us",
      participant: "15551234567@s.whatsapp.net",
    },
    pushName: "Ayesha",
    messageTimestamp: 126,
    message: { conversation: "hello" },
  });

  assert.equal(event.payload.pushName, "Ayesha");
  assert.equal(event.payload.notifyName, "Ayesha");
  assert.equal(event.payload._data.notifyName, "Ayesha");

  const response = await fetch(
    `${baseUrl}/api/default/contacts/${encodeURIComponent("15551234567@s.whatsapp.net")}`,
    { headers: { "X-Api-Key": process.env.WAHA_API_KEY } },
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).name, "Ayesha");
});

test("maps button replies to their action id", () => {
  const event = mapMessage({
    key: { id: "button-1", remoteJid: "15551234567@s.whatsapp.net" },
    messageTimestamp: 125,
    message: {
      buttonsResponseMessage: {
        selectedButtonId: "approve:asset-id:1",
        selectedDisplayText: "Approve",
      },
    },
  });

  assert.equal(event.payload.type, "buttons_response");
  assert.equal(event.payload.selectedButtonId, "approve:asset-id:1");
});

test("maps quoted reply context for @mentions", () => {
  const event = mapMessage({
    key: {
      id: "reply-1",
      remoteJid: "120363000000@g.us",
      participant: "15551234567@s.whatsapp.net",
    },
    messageTimestamp: 127,
    message: {
      extendedTextMessage: {
        text: "@Wallnut Bot can you proof read this",
        contextInfo: {
          stanzaId: "quoted-1",
          participant: "15559876543@s.whatsapp.net",
          mentionedJid: ["15550000000@s.whatsapp.net"],
          quotedMessage: {
            conversation:
              "This is the ideal list I can think of to add but not sure how much of this it could do: Sense check",
          },
        },
      },
    },
  });

  assert.equal(event.payload.body, "@Wallnut Bot can you proof read this");
  assert.equal(event.payload.quotedMessage.body, "This is the ideal list I can think of to add but not sure how much of this it could do: Sense check");
  assert.equal(event.payload.quotedMessage.stanzaId, "quoted-1");
  assert.equal(event.payload.quotedMessage.hasMedia, false);
});

test("normalizes bare phone numbers for Baileys", () => {
  assert.equal(normalizeJid("+1 (555) 123-4567"), "15551234567@s.whatsapp.net");
  assert.equal(normalizeJid("120363000000@g.us"), "120363000000@g.us");
});

test("detects disappearing duration from inbound message context", () => {
  const expiration = expirationFromMessageContent({
    ephemeralMessage: {
      message: {
        extendedTextMessage: {
          text: "hello",
          contextInfo: { expiration: 604800 },
        },
      },
    },
  });
  assert.equal(expiration, 604800);
});

test("passes ephemeralExpiration when sending in disappearing chats", () => {
  const opts = buildSendOptions(undefined, 86400);
  assert.deepEqual(opts, { ephemeralExpiration: 86400 });
});

test("exposes the WAHA-compatible session contract", async () => {
  const unauthorized = await fetch(`${baseUrl}/api/sessions/default`);
  assert.equal(unauthorized.status, 401);

  const response = await fetch(`${baseUrl}/api/sessions/default`, {
    headers: { "X-Api-Key": process.env.WAHA_API_KEY },
  });
  assert.equal(response.status, 200);
  const session = await response.json();
  assert.equal(session.name, "default");
  assert.equal(session.status, "STARTING");
  assert.equal(
    session.config.webhooks[0].url,
    "http://app:3000/api/whatsapp/webhook",
  );
});
