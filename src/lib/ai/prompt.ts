import type { BrandContext, PreviousProofContext, RawReport } from "./types";
import type { ProofChecksConfig } from "@/lib/proof/proof-settings";
import { DEFAULT_PROOF_CHECKS } from "@/lib/proof/proof-settings";

function buildEnabledCheckSections(
  checks: ProofChecksConfig,
  options: { spellingHandled: boolean; includeTyposInModel: boolean },
): string {
  const lines: string[] = [];
  let index = 1;

  if (options.includeTyposInModel && checks.typos) {
    lines.push(
      `${index++}. TYPOS: spelling mistakes and clear misspellings. Use title Misspelled "word" and suggestion Did you mean: correction?`,
    );
  }

  const grammarParts: string[] = [];
  if (checks.grammar) grammarParts.push("grammar, subject-verb agreement, tense, awkward phrasing, sentence fragments");
  if (checks.punctuation) grammarParts.push("punctuation, duplicate words, missing or wrong commas/apostrophes/periods, extra spaces");
  if (checks.capitalization) grammarParts.push("capitalization inconsistencies and ALL-CAPS misuse");
  if (grammarParts.length) {
    const spellingNote = options.spellingHandled
      ? " Do NOT report dictionary spelling errors — those are handled elsewhere."
      : "";
    lines.push(`${index++}. TEXT: ${grammarParts.join("; ")}.${spellingNote}`);
  }

  if (checks.readability) {
    lines.push(
      `${index++}. READABILITY: weak or inconsistent tone, overly long sentences, low contrast, small/unreadable text, poor type hierarchy, overflow, truncation, alignment, spacing, and font rendering problems.`,
    );
    lines.push(
      `${index++}. BRAND & LINKS: brand profile violations (colors, fonts, tone, terminology, banned words) and broken/invalid URLs, emails, phone numbers, or QR codes.`,
    );
  }

  if (checks.missing_content) {
    lines.push(
      `${index++}. MISSING CONTENT: missing or weak CTA, absent disclaimers, truncated copy, or required text that should be present but is not.`,
    );
  }

  if (checks.consistency) {
    lines.push(
      `${index++}. CONSISTENCY: compare with the previous version if provided (changed prices, dates, phone numbers, removed text, etc.).`,
    );
  }

  if (!lines.length) {
    return "No proof categories are enabled. Return a clean report with score 100, status passed, and an empty issues list.";
  }

  return lines.join("\n");
}

/**
 * Stage 1 — read the artwork and capture verbatim text before any QA.
 * The model must not invent, fix, or flag issues at this step.
 */
export function buildTranscriptionPrompt(
  ocrText?: string,
  brand?: BrandContext | null,
): string {
  return `You are a careful transcription engine for marketing artwork images.

Your ONLY job is to read the image and return JSON with two fields:
1. "extracted_text" — every visible text element, copied EXACTLY as printed (headlines, subheads, body, labels, prices, URLs, disclaimers, fine print, logo lettering). Preserve spelling, capitalization, and punctuation even when wrong. Join words on the same line with spaces; one text element per line. If no text is visible, return "".
2. "image_context" — 1–2 sentences describing what the asset is (social post, flyer, banner, packaging, etc.) and where the main text blocks sit.

CRITICAL RULES:
- Read systematically: top to bottom, left to right. Do not skip regions.
- Copy ONLY text you can actually see. Never invent words, slogans, or corrections.
- If a word is unclear, transcribe your best reading of the pixels — do NOT guess an alternative spelling.
- Do NOT report issues, typos, or quality problems. Transcription only.
- Roman Urdu (Urdu in Latin script) should be copied exactly as printed — do not anglicize or "correct" it to English words.

${ocrText ? `OCR HINT (may contain noise — trust your vision for spelling when they disagree):\n"""\n${ocrText.slice(0, 6000)}\n"""\n` : "No OCR hint provided."}

${brand?.company_name ? `Brand context: artwork is for ${brand.company_name}.` : ""}`;
}

/**
 * Stage 2 — visual/brand QA using the stage-1 transcription as ground truth.
 * Spelling is checked separately; the model must not flag typos here.
 */
export function buildSystemPrompt(
  ocrText?: string,
  brand?: BrandContext | null,
  previous?: PreviousProofContext | null,
  extractedText?: string,
  imageContext?: string,
  checks: ProofChecksConfig = DEFAULT_PROOF_CHECKS,
): string {
  const spellingHandled = Boolean(extractedText?.trim());
  const checkSections = buildEnabledCheckSections(checks, {
    spellingHandled,
    includeTyposInModel: false,
  });

  return `You are AI Proof, an expert proofreading and quality-assurance engine for marketing assets (social posts, ads, flyers, packaging, banners, print).

Analyze the provided artwork image. Return a JSON report only.

${spellingHandled ? `CANONICAL TEXT (already transcribed from this image — treat as ground truth for what text exists; do NOT invent additional words):\n"""\n${extractedText!.slice(0, 8000)}\n"""\n${imageContext ? `IMAGE CONTEXT: ${imageContext}\n` : ""}
SPELLING: spelling and typos are checked separately against the canonical text above. Do NOT report spelling mistakes, misspellings, or "did you mean" suggestions. Ignore OCR/typo categories entirely.
` : `TRANSCRIBE EVERY WORD: in the field "extracted_text", transcribe VERBATIM every visible text element in the artwork. Preserve EXACT spelling even if wrong. This transcription is used by an automated spellchecker.\n`}

CHECK THESE CATEGORIES:
${checkSections}

COORDINATES: for every issue, return a tight bounding box (normalized 0–1 only: x, y, w, h each between 0 and 1, rounded to 3 decimal places max). Never use pixel values. If unsure, set location to null.

RULES:
- Be specific and actionable. Reference exact phrases from the canonical text when applicable.
- ${spellingHandled ? "Never flag a word as misspelled. Never suggest a spelling correction." : "Check EVERY word for spelling. Do NOT flag proper nouns as spelling errors just because they are uncommon."}
- Keep the report concise: list at most the 8 most important issues. Instead of many trivial cosmetic nits, group them into a single low-severity item. Do not pad the list.
- Severity: high = blocks publishing (errors, wrong facts, broken layout), medium = should fix, low = nice to have.
- Do NOT invent issues that are not present. If a word is not in the canonical text, do not claim it appears in the artwork.
- If the artwork looks clean, report a high score with an empty (or near-empty) issues list.
- Score 0-100. status must be "passed" (score >= 90 and no high issues), "needs_review" (>= 70), or "errors" (< 70 or any blocking error).

${ocrText && !spellingHandled ? `OCR TEXT EXTRACTED FROM THE IMAGE (use it to double-check spelling, but trust your vision over OCR noise):\n"""\n${ocrText.slice(0, 6000)}\n"""\n` : spellingHandled ? "" : "No OCR text provided."}

${brand ? `BRAND PROFILE:\n${formatBrand(brand)}` : "No brand profile configured."}

ROMAN URDU AWARENESS: Copy may mix English with Roman Urdu (Urdu written in Latin letters). Roman Urdu is about sound and meaning, not English dictionary spelling — variant spellings of the same word are normal (e.g. mein/main/mein, bohat/bahut/boht, accha/acha). When a phrase or sentence is clearly Roman Urdu, do NOT report spelling mistakes or English "did you mean" corrections for those words. Only flag text that is genuinely unreadable gibberish within its intended language.${brand?.allow_slang_roman_urdu ? `\nCASUAL LANGUAGE MODE (ENABLED): The brand expects loose Roman Urdu and casual slang throughout. Spelling irregularities are intentional.
- If a sentence reads coherently — even with loose spelling — it PASSES. Do not flag it.
- Raise a flag (category "typography" or "text") ONLY when a phrase genuinely does not make sense: unintelligible jumbles, random character runs, scrambled text that loses meaning, or mid-sentence truncation that breaks meaning.` : ""}

${previous ? `PREVIOUS VERSION v${previous.version} (score ${previous.score}):\n${previous.issues.map((i) => `- [${i.category}] ${i.title}`).join("\n")}\n${previous.ocr_text ? `Previous OCR text:\n"""\n${previous.ocr_text.slice(0, 4000)}\n"""` : ""}` : "No previous version."}`;
}

/**
 * Single-shot proofing — Gemini handles transcription, spelling, grammar, and visual QA
 * in one API call. No deterministic spellcheck runs afterward.
 */
export function buildStandaloneProofPrompt(
  ocrText?: string,
  brand?: BrandContext | null,
  previous?: PreviousProofContext | null,
  checks: ProofChecksConfig = DEFAULT_PROOF_CHECKS,
): string {
  const checkSections = buildEnabledCheckSections(checks, {
    spellingHandled: false,
    includeTyposInModel: checks.typos,
  });

  return `You are AI Proof, an expert proofreading and quality-assurance engine for marketing assets (social posts, ads, flyers, packaging, banners, print).

Analyze the artwork image in ONE pass. Return JSON only.

FIELDS:
- "extracted_text" — every visible text element, copied EXACTLY as printed (preserve wrong spelling). One element per line.
- "summary" — one concise sentence on overall quality.
- "score" — 0–100.
- "status" — "passed" | "needs_review" | "errors".
- "issues" — prioritized findings with category, severity, title, description, suggestion, location.

CHECK ONLY THESE ENABLED CATEGORIES:
${checkSections}

COORDINATES: normalized 0–1 only (x, y, w, h each 0–1, max 3 decimals). Never pixel values. Use null if unsure.

RULES:
- Read the image directly. Do not invent text that is not visible.
- List at most 10 issues, highest severity first.
- Do not flag proper nouns just because they are uncommon.
- Score 0–100. status "passed" if score >= 90 and no high issues; "needs_review" if >= 70; else "errors".

${ocrText ? `OCR HINT (may contain noise — trust your vision when they disagree):\n"""\n${ocrText.slice(0, 6000)}\n"""\n` : ""}

${brand ? `BRAND PROFILE:\n${formatBrand(brand)}` : "No brand profile configured."}

ROMAN URDU AWARENESS: Copy may mix English with Roman Urdu. Variant spellings are normal (mein/main, bohat/bahut). Do not "correct" Roman Urdu to English words.${brand?.allow_slang_roman_urdu ? `\nCASUAL LANGUAGE MODE: loose Roman Urdu and slang are intentional — only flag text that is genuinely unreadable gibberish.` : ""}

${previous ? `PREVIOUS VERSION v${previous.version} (score ${previous.score}):\n${previous.issues.map((i) => `- [${i.category}] ${i.title}`).join("\n")}` : "No previous version."}`;
}

/** Prompt for a natural WhatsApp reply after proofing is complete. */
export function buildHumanReplyPrompt(report: RawReport): string {
  const issuesText = report.issues
    .slice(0, 12)
    .map((issue) => {
      const parts = [`- [${issue.severity}/${issue.category}] ${issue.title}`];
      if (issue.description) parts.push(`  ${issue.description}`);
      if (issue.suggestion) parts.push(`  Fix: ${issue.suggestion}`);
      return parts.join("\n");
    })
    .join("\n");

  return `You are Wallnut, a proofreading assistant replying on WhatsApp after checking a marketing image or PDF.

Write the reply message body ONLY. No quotes, labels, or greeting.

Requirements:
- Exactly 1 short sentence — casual, direct, no filler
- Base it on the findings below; be specific to this asset
- If typos exist, mention count and at most 1–2 word → fix pairs inline
- If clean, one brief positive line about this piece — no stock phrases
- No bullet lists, markdown, emojis, greeting, or sign-off
- Hard limit: 140 characters

Score: ${report.score}/100 (${report.status})
Summary: ${report.summary?.trim() || "(none)"}

Findings (${report.issues.length}):
${issuesText || "(none — artwork looks clean)"}`;
}

function formatBrand(brand: BrandContext): string {
  const lines: string[] = [];
  if (brand.company_name) lines.push(`Company: ${brand.company_name}`);
  if (brand.tone_of_voice) lines.push(`Tone of voice: ${brand.tone_of_voice}`);
  if (brand.colors?.length)
    lines.push(`Brand colors: ${brand.colors.map((c) => `${c.name} ${c.hex}`).join(", ")}`);
  if (brand.fonts?.length) lines.push(`Fonts: ${brand.fonts.join(", ")}`);
  if (brand.preferred_terminology?.length)
    lines.push(`Preferred terminology: ${brand.preferred_terminology.join(", ")}`);
  if (brand.banned_words?.length) lines.push(`Banned words: ${brand.banned_words.join(", ")}`);
  if (brand.style_guide) lines.push(`Style guide: ${brand.style_guide}`);
  return lines.length ? lines.join("\n") : "(empty)";
}
