import assert from "node:assert/strict";
import { formatWhatsAppReply } from "../src/lib/reportSummary.ts";

const issues = [
  { title: 'Compound spacing: "OneHomes"', severity: "low", category: "marketing" },
  { title: 'Compound spacing: "LiveBeyond"', severity: "low", category: "marketing" },
  { title: 'Compound spacing: "YearinRewind"', severity: "low", category: "marketing" },
  { title: 'Compound spacing: "OverseasPakistanis"', severity: "low", category: "marketing" },
  { title: 'Compound spacing: "CloserToHome"', severity: "low", category: "marketing" },
];

const reply = formatWhatsAppReply(issues, "custom");
assert.match(reply, /^5 Potential Errors\n/);
assert.match(reply, /OneHomes \| LiveBeyond \| YearinRewind \| OverseasPakistanis \| CloserToHome/);
assert.match(reply, /Looks good otherwise 👌🏻$/);

const mixed = formatWhatsAppReply(
  [
    { title: 'Misspelled "teh"', severity: "high", category: "typography" },
    { title: 'Compound spacing: "OneHomes"', severity: "low", category: "marketing" },
  ],
  "custom",
);
assert.match(mixed, /1 Error\nteh/);
assert.match(mixed, /1 Potential Error\nOneHomes/);

console.log("CUSTOM REPLY OK");
console.log(reply);
