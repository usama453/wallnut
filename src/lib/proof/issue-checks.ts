import type { ProofCheckType, ProofChecksConfig } from "./proof-settings";
import { PROOF_CHECK_TYPES } from "./proof-settings";

export interface ClassifiableIssue {
  category?: string | null;
  title?: string | null;
  description?: string | null;
  suggestion?: string | null;
}

function issueHaystack(issue: ClassifiableIssue): string {
  return `${issue.category ?? ""} ${issue.title ?? ""} ${issue.description ?? ""} ${issue.suggestion ?? ""}`.toLowerCase();
}

/** Map a stored issue to the admin-facing check toggle it belongs to. */
export function classifyProofCheck(issue: ClassifiableIssue): ProofCheckType {
  const cat = (issue.category ?? "").toLowerCase();
  const hay = issueHaystack(issue);

  if (
    cat === "consistency" ||
    /\bprevious version\b|\bchanged price\b|\bchanged date\b|\bremoved text\b/.test(hay)
  ) {
    return "consistency";
  }

  if (
    /\bmisspell|\btypo\b|\bspelling\b|did you mean|^misspelled "/i.test(hay) ||
    (cat === "typography" && /\bproper nouns?\b/i.test(hay))
  ) {
    return "typos";
  }

  if (
    /\bmissing\b|\babsent\b|\bno cta\b|\bweak cta\b|\btruncat|\bcut[- ]off\b|\bremoved\b|\bincomplete\b|\bempty\b/.test(
      hay,
    ) ||
    (cat === "marketing" && /\bmissing\b|\bno\b.*\bcta\b|\bdisclaimer\b/.test(hay))
  ) {
    return "missing_content";
  }

  if (
    /\bcapital|\ball[- ]caps\b|\buppercase\b|\blowercase\b|\btitle case\b/.test(hay)
  ) {
    return "capitalization";
  }

  if (
    /\bpunctuat|\bapostrophe\b|\bcomma\b|\bperiod\b|\bexclamation\b|\bdouble space\b|\bextra space\b/.test(
      hay,
    )
  ) {
    return "punctuation";
  }

  if (
    cat === "marketing" ||
    cat === "visual" ||
    /\breadability\b|\bcontrast\b|\bfont size\b|\bunreadable\b|\btoo small\b|\bhierarchy\b|\boverflow\b|\bline[- ]height\b|\bwordy\b|\btone\b|\blong sentence\b/.test(
      hay,
    ) ||
    (cat === "typography" &&
      !/\bmisspell|\btypo\b|\bspelling\b|did you mean|^misspelled "/i.test(hay))
  ) {
    return "readability";
  }

  if (
    cat === "text" ||
    /\bgrammar\b|\btense\b|\bsubject\b.*\bverb\b|\bfragment\b|\bawkward\b|\bphrasing\b|\bagreement\b/.test(
      hay,
    )
  ) {
    return "grammar";
  }

  if (cat === "brand" || cat === "links") return "readability";
  if (cat === "typography") return "typos";

  return "grammar";
}

export function filterIssuesByChecks<T extends ClassifiableIssue>(
  issues: T[],
  checks: ProofChecksConfig,
): T[] {
  return issues.filter((issue) => checks[classifyProofCheck(issue)]);
}

export function enabledCheckLabels(checks: ProofChecksConfig): string[] {
  return PROOF_CHECK_TYPES.filter((key) => checks[key]).map((key) => key.replace(/_/g, " "));
}
