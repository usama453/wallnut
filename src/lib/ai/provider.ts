import type {
  AnalyzeInput,
  AnalyzeOutput,
  AnalyzeTextInput,
  DirectProofInput,
  DirectTextProofInput,
  DirectProofOutput,
  HumanReplyOptions,
  RawIssue,
  RawReport,
  TranscribeInput,
  TranscriptionOutput,
  VisualTypoAuditInput,
} from "./types";

/**
 * Single interface for the proofing model.
 * Swap providers (Gemini, OpenAI, Claude, Ollama, ...) without touching the pipeline.
 */
export interface AiProvider {
  readonly id: string;
  readonly name: string;
  /** Stage 1: read visible text from the artwork without flagging issues. */
  transcribeAsset(input: TranscribeInput): Promise<TranscriptionOutput>;
  /** Stage 2: analyze an artwork image + optional OCR text and brand rules. */
  analyzeAsset(input: AnalyzeInput): Promise<AnalyzeOutput>;
  /** Gemini-only: one image + direct prompt, plain-text response. */
  proofAssetDirect(input: DirectProofInput): Promise<DirectProofOutput>;
  /** Gemini-only: plain text + direct prompt, plain-text response. */
  proofTextDirect(input: DirectTextProofInput): Promise<DirectProofOutput>;
  /** Proof plain text copy (no image) — grammar, clarity, marketing checks. */
  analyzeText(input: AnalyzeTextInput): Promise<AnalyzeOutput>;
  /** Casual chat reply in the bot's persona (short, characterful). */
  chat(message: string): Promise<string>;
  /** Short WhatsApp reply after proofing, based on the finalized report. */
  generateHumanReply(report: RawReport, options?: HumanReplyOptions): Promise<string>;
  /** Re-read the image for visible typos that transcription auto-corrected away. */
  auditVisibleTypos(input: VisualTypoAuditInput): Promise<RawIssue[]>;
}

export type AiProviderId = "gemini" | "mock";

export function providerIdFromEnv(): AiProviderId {
  const id = (process.env.AI_PROVIDER ?? "gemini").toLowerCase();
  if (id === "mock") return "mock";
  return "gemini";
}
