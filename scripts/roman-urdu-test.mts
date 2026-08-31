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

console.log("ROMAN URDU DETECTION OK");
