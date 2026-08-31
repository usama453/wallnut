import assert from "node:assert/strict";
import {
  resolveTextToProof,
  resolveWhatsAppTextToProof,
} from "../src/lib/whatsapp/mention-context.ts";

const copy =
  "Life is a strange journy full of ups and downs. Some days feel easy, while others can be realy hard.";

assert.equal(
  resolveWhatsAppTextToProof({ userMessage: copy }, undefined),
  copy,
  "DM pasted copy proofs without saying proof read",
);
assert.equal(
  resolveWhatsAppTextToProof({ userMessage: copy }, "120363@g.us"),
  null,
  "groups still need an explicit proof command",
);
assert.equal(
  resolveWhatsAppTextToProof({ userMessage: "proof read this", quotedMessage: copy }, "120363@g.us"),
  copy,
  "group proof-read with quote still works",
);
assert.equal(
  resolveTextToProof({ userMessage: "hello" }),
  null,
);

console.log("MENTION CONTEXT OK");
