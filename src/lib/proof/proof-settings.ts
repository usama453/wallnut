export const PROOF_CHECK_TYPES = [
  "typos",
  "grammar",
  "punctuation",
  "capitalization",
  "consistency",
  "readability",
  "missing_content",
] as const;

export type ProofCheckType = (typeof PROOF_CHECK_TYPES)[number];

export const PROOF_RESPONSE_STYLES = ["plain", "mixed", "human", "custom"] as const;

export type ProofResponseStyle = (typeof PROOF_RESPONSE_STYLES)[number];

export type ProofChecksConfig = Record<ProofCheckType, boolean>;

export interface ProofAdminSettings {
  checks: ProofChecksConfig;
  responseStyle: ProofResponseStyle;
}

export const DEFAULT_PROOF_CHECKS: ProofChecksConfig = {
  typos: true,
  grammar: true,
  punctuation: true,
  capitalization: true,
  consistency: true,
  readability: true,
  missing_content: true,
};

export const PROOF_CHECK_LABELS: Record<
  ProofCheckType,
  { title: string; description: string }
> = {
  typos: {
    title: "Typos",
    description: "Misspelled words and dictionary spelling mistakes.",
  },
  grammar: {
    title: "Grammar",
    description: "Subject-verb agreement, tense, fragments, and awkward phrasing.",
  },
  punctuation: {
    title: "Punctuation",
    description: "Missing or wrong commas, apostrophes, periods, and extra spaces.",
  },
  capitalization: {
    title: "Capitalization",
    description: "Wrong caps, inconsistent title case, and ALL-CAPS misuse.",
  },
  consistency: {
    title: "Consistency",
    description: "Changes vs a previous version — prices, dates, phone numbers, removed text.",
  },
  readability: {
    title: "Readability",
    description: "Contrast, font size, hierarchy, tone, and overly long sentences.",
  },
  missing_content: {
    title: "Missing content",
    description: "Missing CTA, disclaimers, truncated copy, or absent required text.",
  },
};

export const PROOF_RESPONSE_STYLE_LABELS: Record<
  ProofResponseStyle,
  { title: string; description: string; example: string }
> = {
  plain: {
    title: "Plain corrections",
    description: "Short before → after pairs, one per line.",
    example: '"postee" → "poster". "desing" → "design".',
  },
  mixed: {
    title: "Counts + samples",
    description: "A quick count with quoted examples.",
    example: 'Found 3 typos: "Desing", "Jumop", "Largr".',
  },
  human: {
    title: "Conversational",
    description: "A short, human WhatsApp-style reply — specific to the asset.",
    example:
      'Found 2 typos: wna → wan, teh → the. Also missing a comma after "Homes".',
  },
  custom: {
    title: "Custom",
    description:
      "Separate definite errors from potential issues, pipe-separated. Clean proofs get a short AI closing line.",
    example:
      "5 Potential Errors\nOneHomes | LiveBeyond | YearinRewind | OverseasPakistanis | CloserToHome",
  },
};

export const DEFAULT_PROOF_ADMIN_SETTINGS: ProofAdminSettings = {
  checks: { ...DEFAULT_PROOF_CHECKS },
  responseStyle: "human",
};

export function normalizeProofChecks(
  value: unknown,
): ProofChecksConfig {
  const checks = { ...DEFAULT_PROOF_CHECKS };
  if (!value || typeof value !== "object") return checks;
  for (const key of PROOF_CHECK_TYPES) {
    const enabled = (value as Record<string, unknown>)[key];
    if (typeof enabled === "boolean") checks[key] = enabled;
  }
  return checks;
}

export function normalizeProofResponseStyle(value: unknown): ProofResponseStyle {
  if (
    value === "plain" ||
    value === "mixed" ||
    value === "human" ||
    value === "custom"
  ) {
    return value;
  }
  return DEFAULT_PROOF_ADMIN_SETTINGS.responseStyle;
}

export function normalizeProofAdminSettings(value: {
  checks?: unknown;
  responseStyle?: unknown;
}): ProofAdminSettings {
  return {
    checks: normalizeProofChecks(value.checks),
    responseStyle: normalizeProofResponseStyle(value.responseStyle),
  };
}

export function hasEnabledProofChecks(checks: ProofChecksConfig): boolean {
  return PROOF_CHECK_TYPES.some((key) => checks[key]);
}

/** Map admin check toggles to the compact widget slider (0–2). */
export function checksToDepth(checks: ProofChecksConfig): 0 | 1 | 2 {
  const enabled = PROOF_CHECK_TYPES.filter((key) => checks[key]);
  if (enabled.length >= 6) return 2;
  if (
    checks.typos &&
    checks.grammar &&
    checks.punctuation &&
    checks.capitalization &&
    !checks.consistency &&
    !checks.readability &&
    !checks.missing_content
  ) {
    return 1;
  }
  if (enabled.length <= 1 && checks.typos) return 0;
  if (enabled.length >= 4) return 2;
  if (enabled.length >= 2) return 1;
  return checks.typos ? 0 : 1;
}

/** Map compact widget slider positions to check presets. */
export function depthToChecks(depth: number): ProofChecksConfig {
  const off = Object.fromEntries(
    PROOF_CHECK_TYPES.map((key) => [key, false]),
  ) as ProofChecksConfig;

  if (depth <= 0) {
    return { ...off, typos: true };
  }
  if (depth === 1) {
    return {
      ...off,
      typos: true,
      grammar: true,
      punctuation: true,
      capitalization: true,
    };
  }
  return { ...DEFAULT_PROOF_CHECKS };
}
