import assert from "node:assert/strict";
import { detectRomanUrduLines, isRomanUrduLine } from "../src/lib/proof/roman-urdu.ts";
import { spellcheck } from "../src/lib/proof/spellcheck.ts";

const englishWithTypos =
  "Life is a strange journy full of ups and downs. Some days feel easy, while others can be realy hard. But even in the difficult moments, there is alway something small worth appriciating. Life doesnt need to be perfect to be meaningfull.";

assert.equal(isRomanUrduLine(englishWithTypos), false, "English copy with the + typos is not Roman Urdu");
assert.equal(isRomanUrduLine("mein ghar ja raha hun"), true, "Roman Urdu line still detected");

const skip = new Set(
  detectRomanUrduLines(englishWithTypos)
    .map((flag, index) => (flag ? index : -1))
    .filter((index) => index >= 0),
);
assert.ok(
  spellcheck(englishWithTypos, { allow: [], skipLineIndices: skip }).length >= 3,
  "spellcheck runs on English paragraph",
);

const mixedRomanUrdu =
  "Easy aur budget-friendly decor idea Pakistan ke liye.";
assert.ok(
  !spellcheck(mixedRomanUrdu).some((f) => f.word.toLowerCase() === "liye"),
  "Roman Urdu liye is not flagged as an English typo",
);

const brokenWordLine = "fresh feel dene b st choice hain";
const broken = spellcheck(brokenWordLine).find((f) => f.word === "b st");
assert.ok(broken, "split-word typo b st is detected");
assert.equal(broken?.suggestions[0], "best");

console.log("ROMAN URDU DETECTION OK");
