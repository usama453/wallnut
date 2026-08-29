/* Local WAHA webhook parsing tests (no network or Supabase). */
import { createHmac } from "crypto";
import {
  constantTimeEqual,
  extractMedia,
  extractWahaMessages,
  getButtonReplyId,
  isButtonReply,
  isWhatsAppEvent,
  verifyWahaWebhookHmac,
} from "../src/lib/whatsapp/webhook.ts";
import {
  canonicalChatId,
  whatsappGroupIdVariants,
} from "../src/lib/whatsapp/jid.ts";

let failed = 0;
function check(name: string, condition: boolean) {
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}`);
  if (!condition) failed++;
}

const imageEvent = {
  event: "message",
  session: "default",
  payload: {
    id: "msg-image",
    from: "15551234567@c.us",
    body: "Homepage",
    hasMedia: true,
    media: {
      url: "http://waha:3000/api/files/msg-image.jpg",
      mimetype: "image/jpeg",
    },
  },
};
const groupPdfEvent = {
  event: "message",
  session: "default",
  me: { id: "15550000000:1@s.whatsapp.net" },
  payload: {
    id: "msg-pdf",
    from: "120363000000@g.us",
    participant: "15557654321@c.us",
    mentions: ["15550000000@s.whatsapp.net"],
    hasMedia: true,
    media: {
      url: "/api/files/msg-pdf.pdf",
      mimetype: "application/pdf",
      filename: "launch.pdf",
    },
  },
};
const buttonEvent = {
  event: "message",
  session: "default",
  payload: {
    id: "msg-button",
    from: "15551234567@c.us",
    type: "buttons_response",
    selectedButtonId: "approve:abc123:1",
    body: "Approve",
    hasMedia: false,
  },
};

const image = extractWahaMessages(imageEvent, "default")[0];
const groupPdf = extractWahaMessages(groupPdfEvent, "default")[0];
const button = extractWahaMessages(buttonEvent, "default")[0];

check("detects WAHA message event", isWhatsAppEvent(imageEvent));
check(
  "extracts image media URL",
  extractMedia(image)?.reference.endsWith("msg-image.jpg") === true,
);
check("extracts PDF", extractMedia(groupPdf)?.mime === "application/pdf");
check("preserves group JID", groupPdf.context.group_id === "120363000000@g.us");
check("preserves group sender", groupPdf.sender === "15557654321@c.us");
check(
  "extracts WhatsApp push names",
  extractWahaMessages(
    {
      event: "message",
      session: "default",
      payload: {
        id: "msg-name",
        from: "120363000000@g.us",
        participant: "15551234567@c.us",
        body: "hello",
        pushName: "Ayesha",
        notifyName: "Ayesha",
      },
    },
    "default",
  )[0]?.pushName === "Ayesha",
);
check("preserves bot identity", groupPdf.botId === "15550000000:1@s.whatsapp.net");
check("preserves structured mentions", groupPdf.mentions.length === 1);
check("detects button reply", isButtonReply(button));
check("parses button id", getButtonReplyId(button) === "approve:abc123:1");
check(
  "ignores outgoing events",
  extractWahaMessages(
    { ...imageEvent, payload: { ...imageEvent.payload, fromMe: true } },
    "default",
  ).length === 0,
);
check(
  "ignores another session",
  extractWahaMessages(imageEvent, "other").length === 0,
);
check(
  "does not treat unsupported media as text",
  extractWahaMessages(
    {
      event: "message",
      session: "default",
      payload: {
        id: "video",
        from: "15551234567@c.us",
        hasMedia: true,
        media: { url: "/api/files/video.mp4", mimetype: "video/mp4" },
      },
    },
    "default",
  )[0]?.type === "unsupported",
);

const rawBody = '{"event":"message","session":"default","payload":{}}';
const secret = "s3cret";
const signature = createHmac("sha512", secret).update(rawBody).digest("hex");
check(
  "verifies WAHA HMAC",
  verifyWahaWebhookHmac(rawBody, signature, secret, "sha512"),
);
check(
  "rejects bad WAHA HMAC",
  !verifyWahaWebhookHmac(rawBody, "deadbeef", secret, "sha512"),
);
check("compares matching API keys", constantTimeEqual("secret", "secret"));
check("rejects wrong API keys", !constantTimeEqual("secret", "wrong"));
check(
  "canonicalizes Baileys direct-chat JIDs",
  canonicalChatId("15551234567@s.whatsapp.net") === "15551234567@c.us",
);
check(
  "supports legacy group ids without a suffix",
  whatsappGroupIdVariants("120363000000@g.us").includes("120363000000"),
);

if (failed) {
  console.error(`${failed} check(s) failed`);
  process.exit(1);
}
console.log("WAHA WEBHOOK PARSING OK");
