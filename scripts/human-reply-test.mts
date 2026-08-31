import assert from "node:assert/strict";
import { formatWhatsAppReply } from "../src/lib/reportSummary.ts";

const typoIssues = [
  {
    title: 'Misspelled "teh"',
    severity: "high",
    category: "typography",
    suggestion: "Did you mean: the?",
  },
];

const conversational = formatWhatsAppReply(typoIssues, "human", {
  humanReply: "Spotted 1 typo — change teh to the.",
});
assert.match(conversational, /teh/i);
assert.doesNotMatch(conversational, /^Found 1 typo:/);

const fallback = formatWhatsAppReply(typoIssues, "human", {
  humanReply: "Looks good, no issues here.",
});
assert.match(fallback, /Found 1 typo/);

console.log("HUMAN REPLY FORMAT OK");
