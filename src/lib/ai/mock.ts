import type { AiProvider } from "./provider";
import type { AnalyzeInput, AnalyzeOutput, AnalyzeTextInput, DirectProofInput, DirectProofOutput, RawIssue, RawReport, TranscribeInput, TranscriptionOutput, VisualTypoAuditInput } from "./types";
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
      ? buildStandaloneProofPrompt(
          input.ocrText,
          input.brand,
          input.previous,
          input.enabledChecks,
        )
      : buildSystemPrompt(
          input.ocrText,
          input.brand,
          input.previous,
          input.extractedText,
          input.imageContext,
          input.enabledChecks,
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

  async proofAssetDirect(_input: DirectProofInput): Promise<DirectProofOutput> {
    await delay(500);
    return { rawText: "All good." };
  }

  async analyzeText(input: AnalyzeTextInput): Promise<AnalyzeOutput> {
    const text = input.text;
    const issues = [];
    if (/\bteh\b/i.test(text)) {
      issues.push({
        category: "text",
        severity: "high" as const,
        title: 'Grammar: "teh" → "the"',
        description: 'Found "teh" in the copy.',
        suggestion: 'Change "teh" to "the".',
      });
    }
    if (!/\b(sense check|cta|call to action)\b/i.test(text) && text.length > 40) {
      issues.push({
        category: "marketing",
        severity: "low" as const,
        title: "Sense check",
        description: "Consider whether the list items are actionable for your audience.",
        suggestion: "Tighten each bullet to a clear capability Wallnut can verify.",
      });
    }
    const score = Math.max(40, 100 - issues.length * 12);
    return {
      rawText: text,
      report: {
        score,
        status: score >= 90 ? "passed" : score >= 70 ? "needs_review" : "errors",
        summary: issues.length ? `Found ${issues.length} issue${issues.length === 1 ? "" : "s"} in the text.` : "Copy looks clean.",
        issues,
        extractedText: text,
      },
    };
  }

  async chat(message: string): Promise<string> {
    await delay(300);
    const text = message.toLowerCase();
    if (/hello|hi|hey|salam|assalam|salaam/.test(text)) {
      return "Hello — I'm Wallnut, a proofreading assistant. Send me an image or PDF whenever you're ready.";
    }
    if (/how are you|how're you|how do you/.test(text)) {
      return "All good here. How can I help with your artwork or copy today?";
    }
    if (/help|what can|how do|how does/.test(text)) {
      return "Simple as can be: send me an image or a PDF and I'll proof it — spelling, brand rules, design — then give you a score out of 100.";
    }
    if (/bye|goodbye|see you/.test(text)) {
      return "See you later! I'll be right here when you need another proof.";
    }
    if (/thank/.test(text)) {
      return "You're most welcome — happy to help with your copy anytime.";
    }
    return "Let me know if you want something proofed — send an image or PDF and I'll score it.";
  }

  async auditVisibleTypos(_input: VisualTypoAuditInput): Promise<RawIssue[]> {
    await delay(100);
    return [];
  }

  async generateHumanReply(
    report: RawReport,
    _options?: import("./types").HumanReplyOptions,
  ): Promise<string> {
    await delay(200);
    const typoIssues = report.issues.filter((issue) => /^Misspelled "/i.test(issue.title));
    if (typoIssues.length) {
      const word = /Misspelled "([^"]+)"/i.exec(typoIssues[0].title)?.[1];
      const fix = /did you mean:\s*([^?.]+)/i.exec(typoIssues[0].suggestion ?? "")?.[1]?.trim();
      if (word && fix) {
        const typoPart =
          typoIssues.length === 1
            ? `Found 1 typo: ${word} → ${fix}.`
            : `Found ${typoIssues.length} typos — ${word} → ${fix} and a few more.`;
        const tip = report.issues.find((issue) => !/^Misspelled "/i.test(issue.title));
        const extra = tip?.suggestion?.trim() || tip?.title?.trim();
        return extra ? `${typoPart} ${extra}`.slice(0, 160) : typoPart;
      }
      return `${typoIssues.length} typo${typoIssues.length === 1 ? "" : "s"} to fix.`.slice(0, 160);
    }
    if (!report.issues.length) {
      const closings = [
        "No typos or copy errors found.",
        "Copy looks clean — nothing to fix.",
        "All clear on spelling and grammar.",
      ];
      return closings[report.score % closings.length];
    }
    const top = report.issues[0];
    const detail = top.suggestion?.trim() || top.title?.trim();
    return (detail || "Worth a quick look before publish.").slice(0, 160);
  }
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
