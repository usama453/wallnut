import type { AiProvider } from "./provider";
import type { AnalyzeInput, AnalyzeOutput, RawReport } from "./types";
import { buildSystemPrompt } from "./prompt";
import { sanitizeText } from "@/lib/text";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";

/**
 * Gemini provider (Google AI Studio, free tier).
 * Uses the generateContent REST endpoint with structured JSON output.
 */
export class GeminiProvider implements AiProvider {
  readonly id = "gemini" as const;
  readonly name = "Gemini 3.5 Flash-Lite";

  private readonly apiKey: string;
  private readonly model: string;

  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY ?? "";
    this.model = process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite";
    if (!this.apiKey && process.env.AI_PROVIDER !== "mock") {
      throw new Error("GEMINI_API_KEY is not set. Add it to .env.local or set AI_PROVIDER=mock.");
    }
  }

  async analyzeAsset(input: AnalyzeInput): Promise<AnalyzeOutput> {
    const systemPrompt = buildSystemPrompt(input.ocrText, input.brand, input.previous);
    const url = `${API_BASE}/models/${this.model}:generateContent?key=${this.apiKey}`;

    // The model occasionally returns truncated/invalid JSON; retry a few times.
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        return await this.attempt(url, input, systemPrompt);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < 3) await new Promise((r) => setTimeout(r, 400 * attempt));
      }
    }
    throw lastError;
  }

  private async attempt(url: string, input: AnalyzeInput, systemPrompt: string): Promise<AnalyzeOutput> {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: systemPrompt },
              {
                inline_data: {
                  mime_type: input.mimeType,
                  data: input.imageBase64,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 8192,
          responseMimeType: "application/json",
          responseSchema: REPORT_SCHEMA,
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Gemini API error ${res.status}: ${body.slice(0, 500)}`);
    }

    const data = await res.json();
    const rawText =
      data?.candidates?.[0]?.content?.parts
        ?.map((part: { text?: string }) => part.text ?? "")
        .filter(Boolean)
        .join("\n") ?? "";
    if (!rawText) {
      throw new Error("Gemini returned an empty response");
    }

    let report: RawReport;
    try {
      report = parseReport(rawText);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to parse Gemini response: ${msg}\nRAW: ${rawText.slice(0, 800)}`);
    }

    return { rawText, report };
  }

  async chat(message: string): Promise<string> {
    const url = `${API_BASE}/models/${this.model}:generateContent?key=${this.apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: TORTOISE_PERSONA }] },
        contents: [{ role: "user", parts: [{ text: message.slice(0, 400) }] }],
        generationConfig: { temperature: 0.9, maxOutputTokens: 120 },
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Gemini chat error ${res.status}: ${body.slice(0, 300)}`);
    }

    const data = await res.json();
    const text =
      data?.candidates?.[0]?.content?.parts
        ?.map((part: { text?: string }) => part.text ?? "")
        .filter(Boolean)
        .join("\n") ?? "";
    if (!text) throw new Error("Gemini chat returned an empty response");
    return text.trim().slice(0, 600);
  }
}

/**
 * Chat persona: a wise, slow, warm tortoise who happens to be an AI proofreader.
 */
export const TORTOISE_PERSONA = `You are Wallnut, a friendly, slow-spoken tortoise who works as the AI Proof assistant. You proof marketing images and PDFs (spelling, brand rules, design) and give a score. Chat warmly and unhurriedly, with gentle tortoise flavor — slow and steady, shell puns welcome. Keep every reply to 1-3 short sentences. If asked how you work, say: send me an image or PDF and I'll run a proof and reply with a score and report. Never say you are a real tortoise or claim to have a shell; you're a chatbot with a tortoise personality.`;

const REPORT_SCHEMA = {
  type: "OBJECT",
  properties: {
    score: { type: "INTEGER", minimum: 0, maximum: 100 },
    status: { type: "STRING", enum: ["passed", "needs_review", "errors"] },
    summary: { type: "STRING" },
    extracted_text: { type: "STRING" },
    issues: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          category: { type: "STRING" },
          severity: { type: "STRING", enum: ["low", "medium", "high"] },
          title: { type: "STRING" },
          description: { type: "STRING" },
          suggestion: { type: "STRING" },
          location: {
            type: "OBJECT",
            properties: {
              x: { type: "NUMBER" },
              y: { type: "NUMBER" },
              w: { type: "NUMBER" },
              h: { type: "NUMBER" },
            },
          },
        },
        required: ["category", "severity", "title"],
      },
    },
  },
  required: ["score", "status", "summary", "issues"],
};

/** Defensive JSON parser: strips markdown fences and tolerates partial payloads. */
export function parseReport(rawText: string): RawReport {
  let text = rawText.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();

  const object = extractFirstJsonObject(text);
  if (!object) throw new Error("Model did not return valid JSON");

  let json: any;
  try {
    json = JSON.parse(object);
  } catch (err) {
    throw new Error(`Model did not return valid JSON: ${(err as Error).message}`);
  }

  const score = clampNumber(Number(json.score ?? 0), 0, 100);
  const issues = Array.isArray(json.issues) ? json.issues.map(normalizeIssue) : [];

  return {
    score,
    status: (json.status ?? inferStatus(score, issues)) as RawReport["status"],
    summary: sanitizeText(typeof json.summary === "string" ? json.summary : ""),
    extractedText: typeof json.extracted_text === "string" ? sanitizeText(json.extracted_text) : undefined,
    issues,
  };
}

/**
 * Replace unpaired UTF-16 surrogates with U+FFFD so report strings always
 * serialize to valid JSON (a lone surrogate escaped as \udXXX is rejected by
 * PostgREST/Aeson with PGRST102 "Empty or invalid json", failing the save).
 */
export { sanitizeText };

/**
 * Extract the first complete top-level JSON object from a string, ignoring any
 * prose or trailing content the model may add around it.
 */
function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
    } else if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function normalizeIssue(raw: any): RawReport["issues"][number] {  const loc = raw.location ?? raw.coordinates ?? null;
  return {
    category: sanitizeText(String(raw.category ?? "text").toLowerCase()),
    severity: ["low", "medium", "high"].includes(raw.severity) ? raw.severity : "medium",
    title: sanitizeText(String(raw.title ?? "Issue")),
    description: raw.description ? sanitizeText(String(raw.description)) : undefined,
    suggestion: raw.suggestion ? sanitizeText(String(raw.suggestion)) : undefined,
    location: loc ? sanitizeLocation(loc) : null,
  };
}

function sanitizeLocation(loc: any) {
  const num = (v: any) => (typeof v === "number" && Number.isFinite(v) ? clampNumber(v, 0, 1) : 0);
  return {
    x: num(loc.x ?? 0),
    y: num(loc.y ?? 0),
    w: clampNumber(num(loc.w ?? 0), 0, 1 - num(loc.x ?? 0)),
    h: clampNumber(num(loc.h ?? 0), 0, 1 - num(loc.y ?? 0)),
  };
}

function inferStatus(score: number, issues: { severity: string }[]): RawReport["status"] {
  const hasHigh = issues.some((i) => i.severity === "high");
  if (score >= 90 && !hasHigh) return "passed";
  if (score >= 70) return "needs_review";
  return "errors";
}

function clampNumber(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}
