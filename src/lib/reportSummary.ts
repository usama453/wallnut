/**
 * Compact, human-readable issue summary for chat reports.
 */
import type { ProofResponseStyle } from "@/lib/proof/proof-settings";
import { DEFAULT_PROOF_ADMIN_SETTINGS } from "@/lib/proof/proof-settings";

export interface SummaryIssue {
  category?: string | null;
  title?: string;
  severity?: string | null;
  description?: string;
  suggestion?: string;
}

export interface WhatsAppReplyContext {
  humanReply?: string | null;
  summary?: string | null;
}

/** Max length for conversational ("human") WhatsApp replies. */
export const HUMAN_REPLY_MAX_CHARS = 100;

function clampHumanReply(text: string): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) return "";
  if (trimmed.length <= HUMAN_REPLY_MAX_CHARS) return trimmed;
  const cut = trimmed.slice(0, HUMAN_REPLY_MAX_CHARS - 1);
  const lastSpace = cut.lastIndexOf(" ");
  const clipped = (lastSpace > 32 ? cut.slice(0, lastSpace) : cut).replace(/[.,;:!?]+$/, "");
  return `${clipped}…`;
}

const CATEGORY_LABELS: Record<string, string> = {
  text: "grammar",
  typography: "typos",
  marketing: "marketing",
  visual: "visual",
  brand: "brand",
  links: "links",
  consistency: "consistency",
};

const LABEL_ORDER = [
  "grammar",
  "nouns",
  "typos",
  "marketing",
  "visual",
  "brand",
  "links",
  "consistency",
  "other",
];

/** The compact bucket label for a single issue. */
export function issueLabel(issue: SummaryIssue): string {
  let label = CATEGORY_LABELS[issue.category ?? ""] ?? "other";
  if (label === "typos" && /\bproper nouns?\b/i.test(issue.title ?? "")) {
    label = "nouns";
  }
  return label;
}

export function summarizeIssues(issues: SummaryIssue[]): string {
  const counts = new Map<string, number>();
  for (const issue of issues) {
    const label = issueLabel(issue);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const typoWords = extractTypoWords(issues);
  const parts: string[] = [];
  for (const label of LABEL_ORDER) {
    if (!counts.has(label)) continue;
    // Typos are named, not counted: "1 grammar, "teh", "recieve", 1 visual".
    if (label === "typos" && typoWords.length) {
      parts.push(quoteWords(typoWords));
    } else {
      parts.push(`${counts.get(label)} ${label}`);
    }
  }
  return parts.join(", ");
}

/** The misspelled words from "Misspelled "..." (×n)" typo findings. */
function extractTypoWords(issues: SummaryIssue[]): string[] {
  const words: string[] = [];
  for (const issue of issues) {
    if (issueLabel(issue) !== "typos") continue;
    const m = /Misspelled\s+"([^"]+)"/.exec(issue.title ?? "");
    if (m) words.push(m[1]);
  }
  return words;
}

function quoteWords(words: string[]): string {
  const cap = 5;
  const shown = words.slice(0, cap).map((w) => `"${w}"`);
  const rest = words.length - shown.length;
  return rest > 0 ? `${shown.join(", ")} +${rest} more` : shown.join(", ");
}

export interface ReportStatus {
  emoji: string;
  label: string;
}

/**
 * One-line status with a priority chain:
 * 1. 🔴 any typo OR any high-severity issue (truncated headline, broken layout,
 *    wrong facts, blocked publish) → "Typos found" / "Critical issues"
 * 2. 🟡 grammar issues → "Grammar"
 * 3. 🟡 any other finding (visual, links, brand, nouns, consistency…) → "Needs review"
 * 4. 🟢 nothing at all → "All good"
 */
export function reportStatus(issues: SummaryIssue[]): ReportStatus {
  const labels = new Set(issues.map(issueLabel));
  const hasHigh = issues.some((i) => i.severity === "high");
  const hasTypos = labels.has("typos");
  const hasGrammar = labels.has("grammar");

  if (hasTypos || hasHigh) {
    return { emoji: "🔴", label: hasTypos ? "Typos found" : "Critical issues" };
  }
  if (hasGrammar) return { emoji: "🟡", label: "Grammar" };
  if (issues.length) return { emoji: "🟡", label: "Needs review" };
  return { emoji: "🟢", label: "All good" };
}

/* ------------------------------------------------------------------------- */

interface CorrectionLine {
  rank: number;
  label: string;
  before: string;
  after: string;
}

/**
 * Build the WhatsApp error list in the compact correction format the user asked
 * for, e.g.:
 *
 *   Typo: recieve → receive
 *   Grammar: He go → He goes
 *   +3 more
 *
 * Shows the top 3 most important corrections, then "+X more". Classifies each
 * issue from its category + parsed title/suggestion text, and extracts a
 * "before → after" pair when a clean one is present.
 */
export function formatCorrectionList(issues: SummaryIssue[]): string {
  const lines = buildCorrectionLines(issues);
  const top = lines.slice(0, 3); // best-ranked corrections first
  const body = top.map((l) => `${l.label}: ${l.before} → ${l.after}`).join("\n");
  const extra = lines.length - top.length;
  const suffix = extra > 0 ? `\n+${extra} more` : "";
  return body ? `${body}${suffix}` : "";
}

/** Structured correction rows for report UI (typos, grammar fixes, etc.). */
export function getCorrectionLines(
  issues: SummaryIssue[],
): Array<{ label: string; before: string; after: string }> {
  return buildCorrectionLines(issues).map(({ label, before, after }) => ({
    label,
    before,
    after,
  }));
}

/** One-line preview of the WhatsApp reply Wallnut sends after proofing. */
export function whatsappReplyPreview(
  issues: SummaryIssue[],
  style: ProofResponseStyle = DEFAULT_PROOF_ADMIN_SETTINGS.responseStyle,
  context?: WhatsAppReplyContext,
): string {
  if (style === "plain") {
    const lines = buildCorrectionLines(issues).slice(0, 1);
    if (lines.length) return `${lines[0].before} → ${lines[0].after}`;
    return "No issues found";
  }
  if (style === "mixed") {
    const typoWords = extractTypoWords(issues);
    if (typoWords.length) {
      return `Found ${typoWords.length} typo${typoWords.length === 1 ? "" : "s"}: ${quoteWords(typoWords.slice(0, 3))}`;
    }
    if (!issues.length) return "No issues found";
    return summarizeIssues(issues);
  }
  if (style === "custom") {
    const { errors, potentialErrors } = bucketCustomTerms(issues);
    const total = errors.length + potentialErrors.length;
    if (!total) return "Looks good 👌🏻";
    const parts: string[] = [];
    if (errors.length) parts.push(`${errors.length} Error${errors.length === 1 ? "" : "s"}`);
    if (potentialErrors.length) {
      parts.push(
        `${potentialErrors.length} Potential Error${potentialErrors.length === 1 ? "" : "s"}`,
      );
    }
    const terms = [...errors, ...potentialErrors].slice(0, 3).join(" | ");
    const extra = total > 3 ? ` +${total - 3}` : "";
    return `${parts.join(", ")}: ${terms}${extra}`;
  }
  const typoLines = getTypoCorrections(issues);
  if (typoLines.length > 0) {
    const first = `${typoLines[0].before} → ${typoLines[0].after}`;
    if (typoLines.length === 1) return `1 typo: ${first}`;
    return `${typoLines.length} typos: ${first} +${typoLines.length - 1}`;
  }
  const humanReply = context?.humanReply?.trim() || context?.summary?.trim();
  if (humanReply) {
    const short = humanReply.replace(/\.$/, "");
    return short.length > 64 ? `${short.slice(0, 61)}…` : short;
  }
  const tip = pickTopTip(issues);
  if (!tip) return issues.length ? summarizeIssues(issues) : "No issues found";
  const short = tip.replace(/\.$/, "");
  return short.length > 64 ? `${short.slice(0, 61)}…` : short;
}

/**
 * WhatsApp reply after proofing. Style is configured by admins on Settings.
 */
export function formatWhatsAppReply(
  issues: SummaryIssue[],
  style: ProofResponseStyle = DEFAULT_PROOF_ADMIN_SETTINGS.responseStyle,
  context?: WhatsAppReplyContext,
): string {
  switch (style) {
    case "plain":
      return formatPlainWhatsAppReply(issues);
    case "mixed":
      return formatMixedWhatsAppReply(issues);
    case "custom":
      return formatCustomWhatsAppReply(issues);
    case "human":
    default:
      return formatHumanWhatsAppReply(issues, context);
  }
}

function formatPlainWhatsAppReply(issues: SummaryIssue[]): string {
  const lines = buildCorrectionLines(issues);
  if (!lines.length) return "No issues found.";
  const body = lines
    .slice(0, 8)
    .map((line) => `"${line.before}" → "${line.after}"`)
    .join(". ");
  const extra = lines.length > 8 ? ` +${lines.length - 8} more.` : ".";
  return `${body}${extra}`;
}

function formatMixedWhatsAppReply(issues: SummaryIssue[]): string {
  const typoWords = extractTypoWords(issues);
  const typoLines = getTypoCorrections(issues);
  const parts: string[] = [];

  if (typoWords.length) {
    parts.push(
      `Found ${typoWords.length} typo${typoWords.length === 1 ? "" : "s"} ${quoteWords(typoWords)}.`,
    );
  } else if (typoLines.length) {
    parts.push(
      `Found ${typoLines.length} typo${typoLines.length === 1 ? "" : "s"} ${quoteWords(
        typoLines.map((line) => line.before),
      )}.`,
    );
  }

  const summary = summarizeIssues(
    issues.filter((issue) => issueLabel(issue) !== "typos" && issueLabel(issue) !== "nouns"),
  );
  if (summary) parts.push(summary.endsWith(".") ? summary : `${summary}.`);

  if (!parts.length) return issues.length ? `${summarizeIssues(issues)}.` : "No issues found.";
  return parts.join(" ");
}

/** Terms for the custom reply format — misspelled words and other flagged copy. */
interface CustomReplyBuckets {
  errors: string[];
  potentialErrors: string[];
}

function customTermFromIssue(issue: SummaryIssue): string | null {
  const hay = `${issue.title ?? ""} ${issue.suggestion ?? ""} ${issue.description ?? ""}`;
  const pair = extractPair(hay);
  if (pair?.before && pair.before !== "—") return pair.before.trim();

  const misspelled = /Misspelled\s+"([^"]+)"/i.exec(issue.title ?? "");
  if (misspelled?.[1]) return misspelled[1].trim();

  const quoted = /"([^"]+)"/.exec(issue.title ?? "");
  if (quoted?.[1]) return quoted[1].trim();

  return null;
}

/** Definite errors: typos and high-severity findings with a concrete fix. */
function isDefiniteCustomError(issue: SummaryIssue): boolean {
  const label = issueLabel(issue);
  if (label === "typos") return true;
  if (issue.severity === "high") return true;

  const hay = `${issue.title ?? ""} ${issue.suggestion ?? ""}`;
  if (
    (label === "grammar" || issue.category === "text" || issue.category === "typography") &&
    issue.severity !== "low" &&
    /misspelled|did you mean|change .* to |should be |replace with/i.test(hay)
  ) {
    return true;
  }
  return false;
}

function bucketCustomTerms(issues: SummaryIssue[]): CustomReplyBuckets {
  const errors = new Set<string>();
  const potential = new Set<string>();

  for (const issue of issues) {
    const term = customTermFromIssue(issue);
    if (!term) continue;
    if (isDefiniteCustomError(issue)) errors.add(term);
    else potential.add(term);
  }

  for (const term of errors) potential.delete(term);

  return {
    errors: [...errors],
    potentialErrors: [...potential],
  };
}

function formatCustomSection(count: number, label: string, terms: string[]): string {
  return `${count} ${label}\n${terms.join(" | ")}`;
}

function formatCustomWhatsAppReply(issues: SummaryIssue[]): string {
  const { errors, potentialErrors } = bucketCustomTerms(issues);
  const total = errors.length + potentialErrors.length;

  if (!total) {
    if (!issues.length) return "Looks good 👌🏻";
    // Issues exist but no extractable terms — treat all as potential.
    const fallback = issues
      .map((issue) => customTermFromIssue(issue) ?? issue.title?.trim())
      .filter((term): term is string => Boolean(term))
      .slice(0, 8);
    if (!fallback.length) return "Please review 👌🏻";
    return `${formatCustomSection(fallback.length, `Potential Error${fallback.length === 1 ? "" : "s"}`, fallback)}\n\nLooks good otherwise 👌🏻`;
  }

  const sections: string[] = [];
  if (errors.length) {
    sections.push(
      formatCustomSection(errors.length, `Error${errors.length === 1 ? "" : "s"}`, errors),
    );
  }
  if (potentialErrors.length) {
    sections.push(
      formatCustomSection(
        potentialErrors.length,
        `Potential Error${potentialErrors.length === 1 ? "" : "s"}`,
        potentialErrors,
      ),
    );
  }

  return `${sections.join("\n\n")}\n\nLooks good otherwise 👌🏻`;
}

export function buildHumanReplyFallback(issues: SummaryIssue[]): string {
  return formatHumanWhatsAppReply(issues);
}

function formatHumanWhatsAppReply(
  issues: SummaryIssue[],
  context?: WhatsAppReplyContext,
): string {
  const generated = context?.humanReply?.trim() || context?.summary?.trim();
  if (generated) return clampHumanReply(generated);

  const typoLines = getTypoCorrections(issues);
  if (typoLines.length) {
    const first = `${typoLines[0].before} → ${typoLines[0].after}`;
    const typo =
      typoLines.length === 1
        ? `1 typo: ${first}`
        : `${typoLines.length} typos: ${first} +${typoLines.length - 1}`;
    const tip = pickTopTip(issues);
    return clampHumanReply(tip ? `${typo}. ${tip}` : typo);
  }

  const tip = pickTopTip(issues);
  if (tip) return clampHumanReply(tip);
  if (!issues.length) return "Looks clean.";
  return clampHumanReply(summarizeIssues(issues));
}

function getTypoCorrections(issues: SummaryIssue[]) {
  return buildCorrectionLines(issues).filter((line) => line.label === "Typo");
}

function pickTopTip(issues: SummaryIssue[]): string | null {
  const candidates = issues
    .filter((issue) => {
      const label = issueLabel(issue);
      if (label === "typos" || label === "nouns") return false;
      if (/\bproper nouns?\b/i.test(issue.title ?? "")) return false;
      return Boolean(humanizeTip(issue));
    })
    .sort(
      (a, b) =>
        severityRank(a.severity) - severityRank(b.severity) ||
        (a.title ?? "").localeCompare(b.title ?? ""),
    );

  return candidates.length ? humanizeTip(candidates[0]) : null;
}

function severityRank(severity: string | null | undefined): number {
  if (severity === "high") return 0;
  if (severity === "medium") return 1;
  return 2;
}

function humanizeTip(issue: SummaryIssue): string | null {
  const suggestion = cleanTipText(issue.suggestion);
  const title = cleanTipText(issue.title);
  const description = cleanTipText(issue.description);
  const hay = `${issue.title ?? ""} ${issue.suggestion ?? ""} ${issue.description ?? ""}`;
  const pair = extractPair(hay);
  const label = issueLabel(issue);

  if (suggestion && !isBoilerplateTip(suggestion)) {
    return sentenceTip(suggestion);
  }

  if (pair && label === "grammar") {
    return `${pair.before} → ${pair.after}.`;
  }

  if (title && !isBoilerplateTip(title)) {
    return sentenceTip(title);
  }

  if (description && !isBoilerplateTip(description)) {
    return sentenceTip(description);
  }

  return null;
}

function cleanTipText(value?: string | null): string {
  return (value ?? "")
    .replace(/\s+/g, " ")
    .replace(/^[-•]\s*/, "")
    .trim();
}

function isBoilerplateTip(text: string): boolean {
  return (
    /^verify the intended spelling/i.test(text) ||
    /^add names to brand profile/i.test(text) ||
    /^not in the dictionary/i.test(text) ||
    /^appears \d+×/i.test(text) ||
    /^found in:/i.test(text) ||
    /^did you mean:/i.test(text) ||
    /misspelled/i.test(text) ||
    /\bproper nouns?\b/i.test(text)
  );
}

function sentenceTip(text: string): string {
  const trimmed = text
    .replace(/\.$/, "")
    .replace(/^consider\s+/i, "")
    .replace(/^please\s+/i, "")
    .trim();
  if (!trimmed) return "";

  const softened = trimmed.replace(
    /^(slightly|lightly|a bit|a little)\s+(darken|lighten|brighten|increase|decrease|reduce)\b/i,
    (_, adv: string, verb: string) => `${adv.toLowerCase()} ${verbToGerund(verb)}`,
  );

  const core = softened !== trimmed ? softened : trimmed;
  const short = core.length > 72 ? `${core.slice(0, 69)}…` : core;
  return short.endsWith("…") ? short : `${capitalize(short)}.`;
}

function verbToGerund(verb: string): string {
  const lower = verb.toLowerCase();
  if (lower.endsWith("en")) return `${lower.slice(0, -2)}ening`;
  if (lower.endsWith("e")) return `${lower.slice(0, -1)}ing`;
  return `${lower}ing`;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Prefer the Wallnut reply text for list labels when proof results exist. */
export function reportDisplayName(
  assetName: string,
  issues: SummaryIssue[] | null | undefined,
): string {
  if (issues != null) return whatsappReplyPreview(issues);
  return assetName;
}

/** Sort corrections so the most concrete/actionable ones surface first. */
function buildCorrectionLines(issues: SummaryIssue[]): CorrectionLine[] {
  const parsed: (CorrectionLine & { score: number })[] = [];
  for (const issue of issues) {
    const t = issue.title ?? "";
    const s = issue.suggestion ?? "";
    const d = issue.description ?? "";
    const cat = (issue.category ?? "").toLowerCase();
    const hay = `${t} ${s} ${d}`;

    // Skip vague visual/layout/scope nitpicks and "not valid asset" noise that
    // have no concrete before→after correction.
    const skip =
      /proper nouns|brand names|not a marketing asset|photograph of a screen|screenshot ui|not a valid/i.test(
        hay,
      ) &&
      (!/change .* to |should be |did you mean|replace with/i.test(hay));
    if (skip) continue;

    const pair = extractPair(hay);
    if (!pair) continue;

    const label = classifyLabel(cat, hay);
    // Prefer to show exact in-place fixes (with a before→after pair) over
    // generic advisories.
    const concrete = /change .* to |should be |did you mean|replace with|typo/i.test(hay) ? 1 : 0;
    const sev = issue.severity === "high" ? 0 : issue.severity === "medium" ? 1 : 2;
    const rank = sev * 10 + concrete; // lower = higher priority
    parsed.push({ rank, label, before: pair.before, after: pair.after, score: rank });
  }
  // Stable ordering: highest priority first.
  parsed.sort((a, b) => a.rank - b.rank);
  return parsed.map((p, i) => ({ rank: i, label: p.label, before: p.before, after: p.after }));
}

/** Extract a clean "before → after" pair from issue title/suggestion text. */
function extractPair(hay: string): { before: string; after: string } | null {
  const clean = (s: string) =>
    s.replace(/["'`]/g, "").replace(/[.\s]+$/, "").trim();
  const norm = hay.replace(/\s+/g, " ");

  // "Did you mean: X, Y?" (spellcheck) → before from "Misspelled "word""
  {
    const mA = /did you mean[:\s]+([^,?"]+)/i.exec(norm);
    if (mA) {
      const mB = /misspelled\s+["']?([^"'?×(]+)/i.exec(norm);
      const before = mB ? clean(mB[1]) : "—";
      const after = clean(mA[1]);
      if (after && after !== "…") return { before, after };
    }
  }

  // Quoted pair: "Change '"X"' to '"Y"'." / "'X' should be 'Y'." / "Replace with 'Y'."
  // Where the "before" and "after" are each delimited by quotes.
  {
    // before … to after, both quoted or the first quoted + bare word after "to"
    const m = /change\s+["']([^"']+)["']\s+to\s+["']([^"']+)["']/i.exec(norm)
      || /["']([^"']+)["']\s+should\s+be\s+["']([^"']+)["']/i.exec(norm)
      || /["']([^"']+)["']\s+to\s+["']([^"']+)["']/i.exec(norm)
      || /^["']([^"']+)["']\s+(?:→|->|=>)\s+["']([^"']+)["']/i.exec(norm);
    if (m) {
      const b = clean(m[1]);
      const a = clean(m[2]);
      if (b && a && b !== a) return { before: b, after: a };
    }
  }

  // Unquoted "X should be Y" / "Change X to Y" — capture up to a clear boundary.
  {
    // Prefer delimited instances: "WORD should be WORD" where before/after
    // are simple tokens (letters, digits, /, . - _). Runs right-to-left so the
    // "after" ends at the end of the sentence.
    const mBe = /\b([A-Za-z0-9][A-Za-z0-9\.\/\-_]*)\s+should\s+be\s+([A-Za-z0-9][A-Za-z0-9\.\/\-_]*)\s*$/i.exec(norm);
    if (mBe) {
      const b = clean(mBe[1]);
      const a = clean(mBe[2]);
      if (b && a && b !== a) return { before: b, after: a };
    }
    const mCh = /change\s+([A-Za-z0-9][A-Za-z0-9\.\/\-_ ]*?)\s+to\s+([A-Za-z0-9][A-Za-z0-9\.\/\-_ ]*?)\s*$/i.exec(norm);
    if (mCh) {
      const b = clean(mCh[1]);
      const a = clean(mCh[2]);
      if (b && a && b !== a) return { before: b, after: a };
    }
  }

  // "Replace with "Y"." → guess the before word if present.
  {
    const m = /replace with\s+["']?([^"'.]+?)["']?\.?$/i.exec(norm);
    if (m) {
      const a = clean(m[1]);
      if (a) {
        const mB = /["'`]([^"'`]+?)["'`]\s+(?:is|appears|looks|reads)\b/i.exec(norm);
        return { before: mB ? clean(mB[1]) : "—", after: a };
      }
    }
  }

  return null;
}

/** Map an issue to one of the user's correction-style labels. */
function classifyLabel(cat: string, hay: string): string {
  const h = hay.toLowerCase();
  if (h.includes("misspelled") || /typo|spelling?\b/i.test(h) || cat === "typo") return "Typo";
  if (h.includes("apostrophe")) return "Missing apostrophe";
  if (cat === "links" || h.includes("url") || h.includes("link")) return "Broken URL";
  if (h.includes("hashtag")) return "Hashtag typo";
  if (h.includes("mention") || h.includes("@")) return "Mention typo";
  if (h.includes("abbreviat")) return "Abbreviation";
  if (h.includes("truncat") || h.includes("cut-off") || h.includes("cut off")) return "Truncation";
  if (h.includes("overflow")) return "Text overflow";
  if (h.includes("capital")) return "Capitalization";
  if (h.includes("punctuat") || h.includes("exclamation") || h.includes("!")) return "Punctuation";
  if (h.includes("double space") || h.includes("extra space")) return "Double space";
  if (h.includes("repetition") || h.includes("duplicate") || h.includes("repeat")) return "Word repetition";
  if (h.includes("missing word")) return "Missing word";
  if (h.includes("extra word") || h.includes("unnecessary word")) return "Extra word";
  if (h.includes("tense")) return "Wrong tense";
  if (h.includes("subject") && h.includes("verb")) return "Subject/verb";
  if (h.includes("singular") || h.includes("plural") || h.includes("agreement")) return "Singular/plural";
  if (h.includes("fragment")) return "Sentence fragment";
  if (h.includes("awkward") || h.includes("phrasing") || h.includes("wordy")) return "Awkward phrasing";
  if (h.includes("emoji")) return "Incorrect emoji";
  if (h.includes("number") && h.includes("format")) return "Number formatting";
  if (h.includes("date")) return "Date formatting";
  if (h.includes("spelling")) return "Inconsistent spelling";
  if (cat === "text" || cat.includes("grammar")) return "Grammar";
  return "Needs review";
}
