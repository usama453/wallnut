import type { AnalyzeInput, AnalyzeOutput } from "./types";

/**
 * Single interface for the proofing model.
 * Swap providers (Gemini, OpenAI, Claude, Ollama, ...) without touching the pipeline.
 */
export interface AiProvider {
  readonly id: string;
  readonly name: string;
  /** Analyze an artwork image + optional OCR text and brand rules. */
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
