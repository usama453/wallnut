import type { ProofChecksConfig } from "@/lib/proof/proof-settings";

export type Severity = "low" | "medium" | "high";
export type ProofStatus = "passed" | "needs_review" | "errors";

/** A single finding, with normalized (0..1) coordinates on the artwork. */
export interface RawIssue {
  category: string;
  severity: Severity;
  title: string;
  description?: string;
  suggestion?: string;
  location?: { x: number; y: number; w: number; h: number } | null;
}

export interface RawReport {
  score: number;
  status: ProofStatus;
  summary: string;
  issues: RawIssue[];
  /** Verbatim transcription of every visible text element (used for the spellcheck pass). */
  extractedText?: string;
  /** Natural WhatsApp reply generated from the finalized report. */
  humanReply?: string;
  /** Plain-text Gemini response for gemini_only / direct pipeline runs. */
  directResponse?: string;
}

export interface DirectProofInput {
  imageBase64: string;
  mimeType: string;
}

export interface DirectTextProofInput {
  text: string;
}

export interface DirectProofOutput {
  rawText: string;
}

/** Options for short WhatsApp-style closing lines after proofing. */
export interface HumanReplyOptions {
  /** DM text proof — this chat message is the entire reply (no report link follows). */
  standalone?: boolean;
}

export interface BrandContext {
  company_name?: string | null;
  colors?: { name: string; hex: string }[];
  fonts?: string[];
  tone_of_voice?: string | null;
  preferred_terminology?: string[];
  banned_words?: string[];
  style_guide?: string | null;
  /** When true, casual slang and Roman Urdu (loose spellings) are accepted;
   * proofing checks that sentences make sense rather than dictionary spelling. */
  allow_slang_roman_urdu?: boolean;
}

/** Previous proof (consistency checks against older versions). */
export interface PreviousProofContext {
  version: number;
  score: number;
  status: string;
  summary?: string | null;
  issues: { title: string; category: string }[];
  ocr_text?: string | null;
}

export interface AnalyzeTextInput {
  /** Plain text copy to proof (WhatsApp message, quoted reply, etc.). */
  text: string;
  brand?: BrandContext | null;
  enabledChecks?: ProofChecksConfig;
}

export interface AnalyzeInput {
  /** base64-encoded image bytes (original or first page of a PDF). */
  imageBase64: string;
  mimeType: string;
  /** Optional: OCR-extracted text from the artwork. */
  ocrText?: string;
  brand?: BrandContext | null;
  previous?: PreviousProofContext | null;
  /** Stage-1 verbatim transcription — when set, spelling is handled outside the model. */
  extractedText?: string;
  /** Stage-1 brief description of the asset layout/context. */
  imageContext?: string;
  /** Single-shot Gemini proofing — no split pipeline or local spellcheck afterward. */
  standalone?: boolean;
  /** Admin-enabled proof categories for this run. */
  enabledChecks?: ProofChecksConfig;
}

export interface TranscribeInput {
  imageBase64: string;
  mimeType: string;
  ocrText?: string;
  brand?: BrandContext | null;
}

export interface TranscriptionOutput {
  extractedText: string;
  imageContext?: string;
}

export interface VisualTypoAuditInput {
  imageBase64: string;
  mimeType: string;
  transcribedText: string;
  brand?: BrandContext | null;
}

export interface AnalyzeOutput {
  /** text returned by the provider (raw). */
  rawText: string;
  report: RawReport;
}
