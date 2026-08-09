/* Local test for WhatsApp webhook parsing (no network, no Supabase). */
import { createHmac } from "crypto";
import {
  verifySignature,
  isWhatsAppEvent,
  extractMedia,
  isButtonReply,
  getButtonReplyId,
} from "../src/lib/whatsapp/webhook.ts";

let failed = 0;
function check(name: string, cond: boolean) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond) failed++;
}

const imageMessage = {
  entry: [{ changes: [{ field: "messages", value: { messages: [{ from: "15551234567", type: "image", image: { id: "MEDIA_1", mime_type: "image/jpeg" } }] } }] }],
};
const pdfMessage = {
  entry: [{ changes: [{ field: "messages", value: { messages: [{ type: "document", document: { id: "MEDIA_2", mime_type: "application/pdf" } }] } }] }],
};
const buttonMessage = {
  entry: [{ changes: [{ field: "messages", value: { messages: [{ type: "interactive", interactive: { type: "button_reply", button_reply: { id: "approve:abc123:1" } } }] } }] }],
};

check("detects WhatsApp event", isWhatsAppEvent(imageMessage));
check("extracts image media", extractMedia(imageMessage.entry[0].changes[0].value.messages[0])?.mediaId === "MEDIA_1");
check("extracts pdf media", extractMedia(pdfMessage.entry[0].changes[0].value.messages[0])?.mime === "application/pdf");
check("ignores non-pdf documents", extractMedia({ type: "document", document: { id: "X", mime_type: "text/plain" } }) === null);
check("detects button reply", isButtonReply(buttonMessage.entry[0].changes[0].value.messages[0]));
check("parses button id", getButtonReplyId(buttonMessage.entry[0].changes[0].value.messages[0]) === "approve:abc123:1");

// signature verification with a known secret
process.env.WHATSAPP_APP_SECRET = "s3cret";
const body = '{"hello":"world"}';
const sig = `sha256=${createHmac("sha256", "s3cret").update(body).digest("hex")}`;
check("verifies valid signature", verifySignature(body, sig));
check("rejects bad signature", !verifySignature(body, "sha256=deadbeef"));
process.env.WHATSAPP_MOCK = "1";
check("mock mode skips signature", verifySignature(body, null));

if (failed) {
  console.error(`${failed} check(s) failed`);
  process.exit(1);
}
console.log("WHATSAPP WEBHOOK PARSING OK");
