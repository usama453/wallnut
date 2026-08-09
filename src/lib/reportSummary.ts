/**
 * Compact, human-readable issue summary for chat reports.
 * Groups issues by category into a single line, e.g.:
 *   "1 grammar, 2 nouns, 1 visual"
 * The aggregated proper-noun finding is labeled "nouns".
 */
export interface SummaryIssue {
  category?: string | null;
  title?: string;
  severity?: string | null;
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
