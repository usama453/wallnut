import type { AiProvider } from "./provider";
import { providerIdFromEnv } from "./provider";
import { GeminiProvider } from "./gemini";
import { MockProvider } from "./mock";

export * from "./types";
export * from "./provider";
export { parseReport } from "./gemini";

let cached: AiProvider | null = null;

/** Returns the configured AI provider (cached per process). */
export function getProvider(): AiProvider {
  if (cached) return cached;

  switch (providerIdFromEnv()) {
    case "mock":
      cached = new MockProvider();
      break;
    case "gemini":
    default:
      cached = new GeminiProvider();
      break;
  }
  return cached;
}
