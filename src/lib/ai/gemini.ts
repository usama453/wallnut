import type { AiProvider } from "./provider";
import { WALLNUT_CONTACT_EMAIL } from "@/lib/whatsapp/config";
import type { AnalyzeInput, AnalyzeOutput, AnalyzeTextInput, HumanReplyOptions, RawReport, TranscribeInput, TranscriptionOutput } from "./types";
import { buildSystemPrompt, buildStandaloneProofPrompt, buildTextProofPrompt, buildTranscriptionPrompt, buildHumanReplyPrompt } from "./prompt";
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

  async transcribeAsset(input: TranscribeInput): Promise<TranscriptionOutput> {
    const systemPrompt = buildTranscriptionPrompt(input.ocrText, input.brand);
    const url = `${API_BASE}/models/${this.model}:generateContent?key=${this.apiKey}`;

    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        return await this.attemptTranscription(url, input, systemPrompt);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < 3) await new Promise((r) => setTimeout(r, 400 * attempt));
      }
    }
    throw lastError;
  }

  async analyzeAsset(input: AnalyzeInput): Promise<AnalyzeOutput> {
    const systemPrompt = input.standalone
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

  async analyzeText(input: AnalyzeTextInput): Promise<AnalyzeOutput> {
    const systemPrompt = buildTextProofPrompt(
      input.text,
      input.brand,
      input.enabledChecks,
    );
    const url = `${API_BASE}/models/${this.model}:generateContent?key=${this.apiKey}`;

    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: systemPrompt }] }],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 4096,
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
        const candidate = data?.candidates?.[0];
        const finishReason = candidate?.finishReason;
        const rawText =
          candidate?.content?.parts
            ?.map((part: { text?: string }) => part.text ?? "")
            .filter(Boolean)
            .join("\n") ?? "";
        if (!rawText) throw new Error("Gemini returned an empty response");
        if (finishReason === "MAX_TOKENS") {
          throw new Error("Gemini response truncated (MAX_TOKENS)");
        }

        const report = parseReport(rawText);
        report.extractedText = input.text.trim();
        return { rawText, report };
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
    const candidate = data?.candidates?.[0];
    const finishReason = candidate?.finishReason;
    const rawText =
      candidate?.content?.parts
        ?.map((part: { text?: string }) => part.text ?? "")
        .filter(Boolean)
        .join("\n") ?? "";
    if (!rawText) {
      throw new Error("Gemini returned an empty response");
    }
    if (finishReason === "MAX_TOKENS") {
      throw new Error("Gemini response truncated (MAX_TOKENS)");
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

  private async attemptTranscription(
    url: string,
    input: TranscribeInput,
    systemPrompt: string,
  ): Promise<TranscriptionOutput> {
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
          temperature: 0.1,
          maxOutputTokens: 4096,
          responseMimeType: "application/json",
          responseSchema: TRANSCRIPTION_SCHEMA,
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Gemini transcription error ${res.status}: ${body.slice(0, 500)}`);
    }

    const data = await res.json();
    const rawText =
      data?.candidates?.[0]?.content?.parts
        ?.map((part: { text?: string }) => part.text ?? "")
        .filter(Boolean)
        .join("\n") ?? "";
    if (!rawText) throw new Error("Gemini transcription returned an empty response");

    const object = extractFirstJsonObject(rawText.trim());
    if (!object) throw new Error("Transcription model did not return valid JSON");

    const json = JSON.parse(object) as {
      extracted_text?: string;
      image_context?: string;
    };

    return {
      extractedText: sanitizeText(
        typeof json.extracted_text === "string" ? json.extracted_text : "",
      ),
      imageContext:
        typeof json.image_context === "string"
          ? sanitizeText(json.image_context)
          : undefined,
    };
  }

  async chat(message: string): Promise<string> {
    const url = `${API_BASE}/models/${this.model}:generateContent?key=${this.apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: WALLNUT_CHAT_PERSONA }] },
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

  async generateHumanReply(
    report: RawReport,
    options?: HumanReplyOptions,
  ): Promise<string> {
    const prompt = buildHumanReplyPrompt(report, options);
    const url = `${API_BASE}/models/${this.model}:generateContent?key=${this.apiKey}`;

    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.75,
              maxOutputTokens: 96,
            },
          }),
        });

        if (!res.ok) {
          const body = await res.text().catch(() => "");
          throw new Error(`Gemini human reply error ${res.status}: ${body.slice(0, 300)}`);
        }

        const data = await res.json();
        const text =
          data?.candidates?.[0]?.content?.parts
            ?.map((part: { text?: string }) => part.text ?? "")
            .filter(Boolean)
            .join("\n") ?? "";
        const reply = sanitizeText(text.trim().replace(/^["']|["']$/g, ""));
        if (!reply) throw new Error("Gemini human reply returned an empty response");
        return reply.slice(0, 160);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < 2) await new Promise((r) => setTimeout(r, 300 * attempt));
      }
    }
    throw lastError;
  }
}

/**
 * Chat persona for casual WhatsApp / Teams replies.
 */
export const WALLNUT_CHAT_PERSONA = `You are Wallnut, a helpful AI proofreading assistant on WhatsApp and Teams.

When someone @mentions you, answer their actual question in 1-2 short sentences. Be specific to what they asked.
Never introduce yourself, never list features, never paste links, and never mention demo mode.
If someone asks how to contact you or get in touch, give ${WALLNUT_CONTACT_EMAIL} only.
Do not tell them to send a file if they already shared text or quoted a message in the prompt.
If they want copy checked, list the corrections inline — your message is the complete proof. Never say a report is on the way or coming later.
Stay brief and practical — no animal jokes, filler, or marketing copy.`;

const TRANSCRIPTION_SCHEMA = {
  type: "OBJECT",
  properties: {
    extracted_text: { type: "STRING" },
    image_context: { type: "STRING" },
  },
  required: ["extracted_text"],
};

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

  text = compactJsonNumberLiterals(text);
  let object = extractFirstJsonObject(text);
  if (!object) object = repairTruncatedJson(text);
  if (!object) throw new Error("Model did not return valid JSON");

  let json: any;
  try {
    json = JSON.parse(object);
  } catch (err) {
    const repaired = repairTruncatedJson(object);
    try {
      json = JSON.parse(repaired);
    } catch {
      throw new Error(`Model did not return valid JSON: ${(err as Error).message}`);
    }
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

/** Collapse runaway float literals that blow up JSON size (e.g. y: 535.0000000…). */
function compactJsonNumberLiterals(json: string): string {
  return json.replace(/-?(\d+)\.(\d{6,})/g, (_match, intPart: string, fracPart: string) => {
    const n = Number(`${intPart}.${fracPart.slice(0, 8)}`);
    if (!Number.isFinite(n)) return "0";
    return Number(n.toFixed(4)).toString();
  });
}

/** Best-effort close for truncated model JSON. */
function repairTruncatedJson(text: string): string {
  let s = compactJsonNumberLiterals(text.trim());
  const start = s.indexOf("{");
  if (start < 0) return s;
  s = s.slice(start);

  s = s.replace(/,\s*\{[\s\S]*$/, "");
  s = s.replace(/,\s*"[^"]*":\s*"[^"]*$/, "");
  s = s.replace(/,\s*"[^"]*":\s*-?\d+\.?\d*$/, "");
  s = s.replace(/,\s*"[^"]*":\s*\{[\s\S]*$/, "");
  s = s.replace(/,\s*$/, "");

  let braces = 0;
  let brackets = 0;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") braces++;
    else if (ch === "}") braces--;
    else if (ch === "[") brackets++;
    else if (ch === "]") brackets--;
  }

  if (inString) s += '"';
  while (brackets > 0) {
    s += "]";
    brackets--;
  }
  while (braces > 0) {
    s += "}";
    braces--;
  }
  return s;
}

function normalizeIssue(raw: any): RawReport["issues"][number] {
  const loc = raw.location ?? raw.coordinates ?? null;
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
  const num = (v: any) => {
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) return null;
    return n;
  };
  const x = num(loc.x ?? 0);
  const y = num(loc.y ?? 0);
  const w = num(loc.w ?? 0);
  const h = num(loc.h ?? 0);
  if (x == null || y == null || w == null || h == null) return null;
  if ([x, y, w, h].some((value) => value > 1.05 || value < -0.05)) return null;
  return {
    x: clampNumber(x, 0, 1),
    y: clampNumber(y, 0, 1),
    w: clampNumber(w, 0, 1 - clampNumber(x, 0, 1)),
    h: clampNumber(h, 0, 1 - clampNumber(y, 0, 1)),
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
