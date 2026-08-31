import english10 from "wordlist-english/english-words-10.json";
import english20 from "wordlist-english/english-words-20.json";
import english35 from "wordlist-english/english-words-35.json";
import english40 from "wordlist-english/english-words-40.json";
import english50 from "wordlist-english/english-words-50.json";
import english55 from "wordlist-english/english-words-55.json";
import english60 from "wordlist-english/english-words-60.json";
import english70 from "wordlist-english/english-words-70.json";
import { detectRomanUrduLines, isRomanUrduToken, shouldSpellcheckToken } from "./roman-urdu";

const BASE = new Set(
  [
    ...english10,
    ...english20,
    ...english35,
    ...english40,
    ...english50,
    ...english55,
    ...english60,
    ...english70,
  ].map((w) => w.toLowerCase()).filter(Boolean),
);

/** Common words the dictionary misses (months, weekdays, titles, etc.). */
const SUPPLEMENTAL = `
january february march april may june july august september october november december
monday tuesday wednesday thursday friday saturday sunday
mr mrs ms dr prof sr jr vs etc e.g i.e
st nd rd th
deals daily flash sale edition special weekend
instagram facebook tiktok linkedin youtube google whatsapp amazon
chatgpt github azure iphone pokemon spotify netflix zoom slack notion figma canva
dribbble behance paypal stripe shopify wordpress squarespace mailchimp hubspot
salesforce aws meta microsoft apple samsung nike adidas tesla
corp inc ltd llc gmbh co plc
didn't don't doesn't can't won't isn't aren't wasn't weren't hasn't haven't hadn't shan't
who's what's that's there's here's let's it's
you're we're they're i'm i've you've we've they've
i'll you'll we'll they'll she'll he'll it'll
gonna wanna gotta kinda sorta
`.split(/\s+/);

const ACCEPTED = new Set<string>(BASE);
for (const w of SUPPLEMENTAL) ACCEPTED.add(w);

// Common marketing / web / business vocabulary missing from the word-list but
// ubiquitous in ad copy. Without these, terms like "CTA"/"CTAs", "signup",
// "demo", "branding", "reel" get false-flagged as typos.
const MARKETING = `
cta ctas call-to-action signup landing-page clickthrough lead-gen leads
leadgen demo demos funnel conversion conversions roi kpi kpis ux seo
branding billboard reels reel story stories sponsor sponsors
persona personas painpoints funnels
`.split(/\s+/).flatMap((w) => w.split("-"));
for (const w of MARKETING) if (w) ACCEPTED.add(w);

const ACCEPTED_BY_FIRST_LETTER = new Map<string, string[]>();
for (const w of ACCEPTED) {
  const key = w[0] ?? "";
  const bucket = ACCEPTED_BY_FIRST_LETTER.get(key);
  if (bucket) bucket.push(w);
  else ACCEPTED_BY_FIRST_LETTER.set(key, [w]);
}

/** Frequently-used words (top-50k tiers + supplemental). Only these count as
 * "common" targets for typo detection, so names that happen to anagram to a
 * RARE dictionary word (e.g. Oliver ↔ violer) are not flagged as typos. */
const COMMON = new Set<string>(
  [...english10, ...english20, ...english35, ...english40, ...english50]
    .map((w) => w.toLowerCase())
    .filter(Boolean),
);
for (const w of SUPPLEMENTAL) COMMON.add(w);

/** Top-35k words only — reserved for single-substitution typo matches, which
 * are less reliable than transpositions ("Noah"↔"nosh", "Ava"↔"aga" are 1 edit
 * from names). */
const VERY_COMMON = new Set<string>(
  [...english10, ...english20, ...english35].map((w) => w.toLowerCase()).filter(Boolean),
);

export interface SpellcheckFinding {
  word: string;
  context: string;
  suggestions: string[];
  count: number;
  /** "medium" = clearly a typo (lowercase word), "low" = possibly a proper noun. */
  severity: "low" | "medium";
  /** Set on the single aggregated proper-noun finding — the individual words it covers. */
  words?: string[];
}

export interface SpellcheckOptions {
  /** Words to treat as intentional (brand names, terminology, asset name tokens). */
  allow?: string[];
  /** Skip spellcheck on these line indices (e.g. Roman Urdu captions). */
  skipLineIndices?: boolean[];
}

const IGNORE_PATTERN =
  /^(?:https?:\/\/|www\.)?[\w.-]*\.(com|net|org|io|co|me|ai|app|info|edu|gov|dev|xyz|online|store|uk|us|de|fr|in|pk)(?:[/\w-]*)?$/i;

const MASK_URLS = /https?:\/\/\S+|www\.\S+|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/** Deterministic spellcheck: flags words missing from the dictionary. */
export function spellcheck(text: string, options: SpellcheckOptions = {}): SpellcheckFinding[] {
  const allow = new Set(
    (options.allow ?? [])
      .flatMap((w) => w.split(/[\s\-,/._]+/))
      .map((w) => w.toLowerCase())
      .filter(Boolean),
  );

  const lines = text.split("\n");
  const skipLines =
    options.skipLineIndices ?? detectRomanUrduLines(text);

  const tokens = text
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line, lineIdx) => {
      const out: { word: string; lineIdx: number; col: number; len: number }[] = [];
      const masked = line.replace(MASK_URLS, (m) => " ".repeat(m.length));
      const re = /[A-Za-z']{2,}/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(masked)) !== null) {
        out.push({ word: m[0], lineIdx, col: m.index, len: m[0].length });
      }
      return out;
    })
    .flat();

  const seen = new Map<string, { context: string; count: number; word: string }>();
  for (const t of tokens) {
    if (!shouldSpellcheckToken(t.word, skipLines[t.lineIdx] ?? false)) continue;
    const lower = t.word.toLowerCase();
    if (seen.has(lower)) {
      seen.get(lower)!.count++;
      continue;
    }
    // Possessives match the stem ("Microsoft's" → "microsoft").
    const stem = lower.replace(/'s$/, "");
    if (allow.has(lower) || allow.has(stem)) continue;
    if (isRomanUrduToken(t.word)) continue;
    if (ACCEPTED.has(lower) || ACCEPTED.has(stem)) continue;
    if (IGNORE_PATTERN.test(t.word)) continue;
    if (t.len >= 8 && new Set(lower).size === 1) continue;
    // All-caps tokens are acronyms / brand shout-outs ("CTA", "AD", "USA"),
    // never spelling typos. Optional trailing plural/possessive: "CTAs", "CTAs'".
    if (/^[A-Z]{2,}(?:s|'s)?$/.test(t.word)) continue;

    const line = lines[t.lineIdx] ?? "";
    const start = Math.max(0, t.col - 40);
    const end = Math.min(line.length, t.col + t.word.length + 40);
    const context = line.slice(start, end).trim();

    seen.set(lower, { context, count: 1, word: t.word });
  }

  const findings: SpellcheckFinding[] = [...seen.entries()].map(([lower, info]) => {
    const suggestions = suggestCorrections(lower);
    return {
      word: info.word,
      context: info.context,
      suggestions,
      count: info.count,
      severity: severityFor(lower, info.word),
    };
  });

  const typos = findings.filter((f) => f.severity === "medium");
  const broken = findBrokenSpacedWords(text).filter(
    (f) => !seen.has(f.word.toLowerCase()),
  );
  typos.push(...broken);
  // Short unknown tokens (2-3 chars) are almost always OCR noise from logos,
  // watermarks or stylized fonts — not real typos. Keep one only when it has a
  // plausible correction (handled by severity: those are "medium"), and drop
  // short unexplained tokens from the proper-noun bucket entirely.
  const properNouns = findings.filter((f) => f.severity === "low" && f.word.length >= 4);

  // Cap individual typos so reports stay concise; deeper typos are dropped.
  const MAX_TYPO_FINDINGS = 10;
  const capped = typos.slice(0, MAX_TYPO_FINDINGS);

  // Collapse all possible proper nouns / acronyms into a single aggregated
  // finding instead of one issue per word (avoids false-positive spam).
  if (properNouns.length) {
    capped.push({
      word: "(proper nouns)",
      context: "",
      suggestions: [],
      count: properNouns.length,
      severity: "low",
      words: properNouns.map((f) => f.word),
    });
  }

  return capped;
}

/**
 * Visible gap inside a word (e.g. "b st" printed as two tokens for "best").
 * Single-letter tokens are skipped by normal spellcheck (`{2,}` regex).
 */
function findBrokenSpacedWords(text: string): SpellcheckFinding[] {
  const findings: SpellcheckFinding[] = [];
  const lines = text.replace(/\r/g, "").split("\n");
  const patterns = [
    /\b([a-z])\s+([a-z]{2,})\b/gi,
    /\b([a-z]{2,})\s+([a-z])\b/gi,
  ] as const;

  for (const line of lines) {
    for (const re of patterns) {
      re.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = re.exec(line)) !== null) {
        const before = `${match[1]} ${match[2]}`;
        const correction = guessMergedWord(match[1]!, match[2]!);
        if (!correction || correction === `${match[1]}${match[2]}`.toLowerCase()) continue;
        if (!COMMON.has(correction)) continue;

        findings.push({
          word: before,
          context: line.trim(),
          suggestions: [correction],
          count: 1,
          severity: "medium",
        });
      }
    }
  }

  return findings;
}

function guessMergedWord(a: string, b: string): string | null {
  const prefix = a.toLowerCase();
  const suffix = b.toLowerCase();
  const direct = `${prefix}${suffix}`;
  if (COMMON.has(direct) || ACCEPTED.has(direct)) return direct;

  for (const mid of ["e", "a", "i", "o", "u"]) {
    const candidate = `${prefix}${mid}${suffix}`;
    if (COMMON.has(candidate) || ACCEPTED.has(candidate)) return candidate;
  }

  return suggestCorrections(direct).find((word) => COMMON.has(word)) ?? null;
}

/**
 * Words with no strong correction are treated as names / brands / handles /
 * acronyms ("low" → aggregated nouns bucket), NOT as typos.
 *
 * Length-aware noise guard: real typos are rarely shorter than 3 letters, and
 * 1-2 char OCR fragments ("wr", "bls") sit within one substitution of some
 * ultra-common word purely by chance. So:
 * - ≤2 chars: never a typo.
 * - 3 chars: typo only on an exact transposition of a COMMON word ("teh").
 * - ≥4 chars: full rules below.
 */
function severityFor(lower: string, original: string): "low" | "medium" {
  const capitalized = /[A-Z]/.test(original[0] ?? "");
  if (lower.length <= 2) return "low";
  if (
    strongCorrection(
      lower,
      capitalized,
      lower.length === 3 ? "anagram-only" : "full",
    )
  )
    return "medium";
  return "low";
}

/** True if the word is a same-length transposition of a COMMON word, or one
 * substitution away from a VERY_COMMON word (the latter only for lowercase
 * words — capitalized ones are usually names, and only for words ≥4 chars). */
function strongCorrection(
  word: string,
  capitalized: boolean,
  mode: "anagram-only" | "full",
): boolean {
  const bucket = ACCEPTED_BY_FIRST_LETTER.get(word[0]) ?? [];
  const sorted = [...word].sort().join("");
  for (const candidate of bucket) {
    if (candidate === word) continue;
    if (candidate.length !== word.length) continue;
    if (!COMMON.has(candidate)) continue;
    // Transposition of a common word always counts ("Feburary", "teh").
    if ([...candidate].sort().join("") === sorted) return true;
    if (
      mode === "full" &&
      !capitalized &&
      word.length >= 4 &&
      VERY_COMMON.has(candidate) &&
      damerauLevenshtein(word, candidate) <= 1
    ) {
      return true;
    }
  }
  return false;
}

const MAX_SUGGESTIONS = 3;

/** Damerau-Levenshtein suggestions, scanning the whole letter bucket and ranking
 * anagram matches (common transposition typos) first. */
function suggestCorrections(word: string): string[] {
  const bucket = ACCEPTED_BY_FIRST_LETTER.get(word[0]) ?? [];
  const minLen = Math.max(2, word.length - 1);
  const maxLen = word.length + 1;
  const sorted = [...word].sort().join("");

  const ranked: { w: string; dist: number; anagram: boolean }[] = [];
  for (const candidate of bucket) {
    if (candidate === word) continue;
    if (candidate.length < minLen || candidate.length > maxLen) continue;
    const dist = damerauLevenshtein(word, candidate);
    if (dist > 2) continue;
    ranked.push({ w: candidate, dist, anagram: [...candidate].sort().join("") === sorted });
  }

  ranked.sort(
    (a, b) =>
      (b.anagram ? 1 : 0) - (a.anagram ? 1 : 0) || a.dist - b.dist || a.w.localeCompare(b.w),
  );
  return ranked.slice(0, MAX_SUGGESTIONS).map((r) => r.w);
}

function damerauLevenshtein(a: string, b: string): number {
  const al = a.length;
  const bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;
  if (Math.abs(al - bl) > 2) return 3;

  const d: number[][] = Array.from({ length: al + 1 }, () => new Array(bl + 1).fill(0));
  for (let i = 0; i <= al; i++) d[i][0] = i;
  for (let j = 0; j <= bl; j++) d[0][j] = j;
  for (let i = 1; i <= al; i++) {
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + cost);
      }
    }
  }
  return d[al][bl];
}
