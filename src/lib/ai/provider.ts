import type { AnalyzeInput, AnalyzeOutput, TranscribeInput, TranscriptionOutput } from "./types";

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
  /** Casual chat reply in the bot's persona (short, characterful). */
  chat(message: string): Promise<string>;
}

export type AiProviderId = "gemini" | "mock";

export function providerIdFromEnv(): AiProviderId {
  const id = (process.env.AI_PROVIDER ?? "gemini").toLowerCase();
  if (id === "mock") return "mock";
  return "gemini";
}
