import type { AiProvider } from "./provider";
import type { AnalyzeInput, AnalyzeOutput, TranscribeInput, TranscriptionOutput } from "./types";
import { buildSystemPrompt, buildStandaloneProofPrompt } from "./prompt";

/**
 * Mock provider: no API keys, no network, deterministic output.
 * Useful for local development, tests, and demos without any cost.
 * It inspects the OCR text for common mistakes to feel "real".
 */
export class MockProvider implements AiProvider {
  readonly id = "mock" as const;
  readonly name = "Mock (offline)";

  async transcribeAsset(input: TranscribeInput): Promise<TranscriptionOutput> {
    await delay(400);
    return {
      extractedText: input.ocrText ?? "",
      imageContext: "Mock marketing asset with visible copy.",
    };
  }

  async analyzeAsset(input: AnalyzeInput): Promise<AnalyzeOutput> {
    const prompt = input.standalone
      ? buildStandaloneProofPrompt(input.ocrText, input.brand, input.previous)
      : buildSystemPrompt(
          input.ocrText,
          input.brand,
          input.previous,
          input.extractedText,
          input.imageContext,
        );
    await delay(input.standalone ? 700 : 900);

    const text = input.extractedText || input.ocrText || "";
    const issues = [];

    const typos: [RegExp, string, string][] = [
      [/feburary/gi, "Feburary", "February"],
      [/teh/gi, "teh", "the"],
      [/recieve/gi, "recieve", "receive"],
      [/seperate/gi, "seperate", "separate"],
      [/definately/gi, "definately", "definitely"],
    ];
    if (input.standalone || !input.extractedText) {
      for (const [re, wrong, right] of typos) {
        if (re.test(text)) {
          issues.push({
            category: "text",
            severity: "high" as const,
            title: `Misspelled "${wrong}"`,
            description: `Found "${wrong}" in the copy.`,
            suggestion: `Replace with "${right}".`,
            location: { x: 0.12, y: 0.1, w: 0.3, h: 0.06 },
          });
        }
      }
    }

    if (!/sign up|buy now|get started|subscribe|learn more|shop now|book now|call now/i.test(text)) {
      issues.push({
        category: "marketing",
        severity: "medium" as const,
        title: "CTA could be stronger",
        description: "No clear call-to-action detected.",
        suggestion: "Add a strong, single CTA (e.g. 'Shop now').",
        location: { x: 0.3, y: 0.82, w: 0.4, h: 0.06 },
      });
    }

    const banned = input.brand?.banned_words ?? [];
    for (const word of banned) {
      if (new RegExp(`\\b${escapeRegExp(word)}\\b`, "i").test(text)) {
        issues.push({
          category: "brand",
          severity: "medium" as const,
          title: `Banned word "${word}"`,
          description: `Brand profile bans the word "${word}".`,
          suggestion: `Use approved terminology from your brand profile.`,
          location: { x: 0.15, y: 0.25, w: 0.25, h: 0.05 },
        });
      }
    }

    if (/(https?:\/\/|www\.)[^\s]*/i.test(text)) {
      issues.push({
        category: "links",
        severity: "low" as const,
        title: "Verify website URL",
        description: "A URL was found — confirm it resolves and is not a typo.",
        suggestion: "Open the link to confirm it loads.",
        location: { x: 0.5, y: 0.9, w: 0.3, h: 0.05 },
      });
    }

    if (/\+?\d[\d\s().-]{7,}/.test(text)) {
      issues.push({
        category: "links",
        severity: "low" as const,
        title: "Verify phone number format",
        description: "A phone number was detected — confirm the format is correct.",
        suggestion: "Use a consistent format, e.g. (555) 123-4567.",
        location: { x: 0.6, y: 0.15, w: 0.25, h: 0.05 },
      });
    }

    const score = Math.max(40, 100 - issues.length * 9);

    return {
      rawText: prompt, // not meaningful for mock
      report: {
        score,
        status: score >= 90 ? "passed" : score >= 70 ? "needs_review" : "errors",
        summary:
          issues.length === 0
            ? "This artwork looks clean. No issues found."
            : `Found ${issues.length} issue${issues.length > 1 ? "s" : ""}.`,
        issues,
      },
    };
  }

  async chat(message: string): Promise<string> {
    await delay(300);
    const text = message.toLowerCase();
    if (/hello|hi|hey|salam|assalam|salaam/.test(text)) {
      return "Hello, friend... I'm Wallnut the proofing tortoise. Slow and steady, that's me. Send me an image or PDF whenever you're ready.";
    }
    if (/how are you|how're you|how do you/.test(text)) {
      return "I'm steady as ever, my friend. The shell is dry, the glasses are on. How can I help your artwork today?";
    }
    if (/help|what can|how do|how does/.test(text)) {
      return "Simple as can be: send me an image or a PDF and I'll proof it — spelling, brand rules, design — then give you a score out of 100.";
    }
    if (/bye|goodbye|see you/.test(text)) {
      return "Take your time leaving... I'll be right here, slow and steady. Goodbye for now.";
    }
    if (/thank/.test(text)) {
      return "You're most welcome. A little patience goes a long way, as we tortoises say.";
    }
    return "Hmm... let me think on that slowly. Meanwhile, if you send me an image or PDF, I can proof it and give you a score.";
  }
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
