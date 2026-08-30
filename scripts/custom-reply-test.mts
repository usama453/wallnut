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
assert.doesNotMatch(reply, /Looks good otherwise/);

const mixed = formatWhatsAppReply(
  [
    { title: 'Misspelled "teh"', severity: "high", category: "typography" },
    { title: 'Compound spacing: "OneHomes"', severity: "low", category: "marketing" },
  ],
  "custom",
);
assert.match(mixed, /1 Error\nteh/);
assert.match(mixed, /1 Potential Error\nOneHomes/);

const grouped = formatWhatsAppReply(
  [
    {
      title: "5 words may be proper nouns or brand names",
      description:
        "Not in the dictionary: OneHomes, LiveBeyond, YearinRewind, OverseasPakistanis, CloserToHome.",
      severity: "low",
      category: "typography",
    },
  ],
  "custom",
);
assert.match(grouped, /^5 Potential Errors\n/);
assert.match(
  grouped,
  /OneHomes \| LiveBeyond \| YearinRewind \| OverseasPakistanis \| CloserToHome/,
);

assert.doesNotMatch(grouped, /Looks good otherwise/);

const clean = formatWhatsAppReply([], "custom");
assert.equal(clean, "Looks good 👌🏻");

console.log("GROUPED DICTIONARY OK");
console.log(grouped);
