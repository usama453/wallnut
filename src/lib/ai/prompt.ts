import type { BrandContext, PreviousProofContext } from "./types";

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
): string {
  const spellingHandled = Boolean(extractedText?.trim());

  return `You are AI Proof, an expert proofreading and quality-assurance engine for marketing assets (social posts, ads, flyers, packaging, banners, print).

Analyze the provided artwork image. Return a JSON report only.

${spellingHandled ? `CANONICAL TEXT (already transcribed from this image — treat as ground truth for what text exists; do NOT invent additional words):\n"""\n${extractedText!.slice(0, 8000)}\n"""\n${imageContext ? `IMAGE CONTEXT: ${imageContext}\n` : ""}
SPELLING: spelling and typos are checked separately against the canonical text above. Do NOT report spelling mistakes, misspellings, or "did you mean" suggestions. Ignore OCR/typo categories entirely.
` : `TRANSCRIBE EVERY WORD: in the field "extracted_text", transcribe VERBATIM every visible text element in the artwork. Preserve EXACT spelling even if wrong. This transcription is used by an automated spellchecker.\n`}

CHECK THESE CATEGORIES:
1. TEXT: ${spellingHandled ? "grammar, punctuation, duplicate words, capitalization inconsistencies — only when clearly wrong against the canonical text." : "spelling, grammar, punctuation, duplicate words, capitalization, inconsistent writing style."}
2. MARKETING COPY: weak or missing CTA, inconsistent tone, overly long/unreadable sentences, missing disclaimers, incorrect pricing/date/phone formatting.
3. TYPOGRAPHY: font rendering errors (missing glyphs, boxes/tofu \u25a1, garbled/mis-rendered characters), inconsistent font families or weights between items that belong to the same hierarchy, poor font pairing, broken type scale or hierarchy (e.g. heading smaller than body, mixed serif/sans where it hurts), letter-spacing/kerning/tracking problems, text overflow, truncation with ellipsis, overlapping text, line-height too tight, inconsistent capitalization or misuse of ALL-CAPS, wrong straight vs curly quotes/apostrophes, widows/orphans.${spellingHandled ? " Do NOT flag dictionary spelling errors — those are handled elsewhere." : ""}
4. VISUAL QA: low contrast, small/unreadable text, elements too close to edges, safe-margin violations, alignment inconsistencies, cropped logos, poor spacing.
5. BRAND: anything that violates the brand profile below (colors, fonts, tone, terminology, banned words).
6. LINKS: URLs, email addresses, phone numbers, QR codes — flag format problems and obviously broken/invalid URLs.
7. CONSISTENCY: compare with the previous version if provided (changed prices, dates, phone numbers, removed text, etc.).

COORDINATES: for every issue, return a tight bounding box around the exact text or element affected (normalized 0–1: x, y = top-left; w, h = size). Place the box on the visible pixels of the word or UI element — not the general area. If you cannot locate it confidently, set location to null instead of guessing.

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
