import type { DealAnalysis } from "./types";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";

export interface AnalyzeContext {
  companyName?: string;
  contactName?: string;
  contactRole?: string;
  stage?: string;
  healthScore?: number | null;
  dealValue?: number | null;
  knownFacts?: { category: string; key: string; value: string; confidence: string }[];
  people?: { name: string; role?: string | null; relationship?: string | null }[];
  previousSummary?: string | null;
  pastActions?: { title: string; status: string }[];
  transcriptTitle?: string;
  transcript: string;
}

const FACT_CATEGORIES = [
  "budget", "pain", "goals", "current_solution", "competitors", "timeline",
  "decision_date", "champion", "economic_buyer", "decision_criteria",
  "procurement", "next_steps",
].join(", ");

const SYSTEM_PROMPT = `You are an elite sales strategist — not a summarizer. Your job is to read a sales call transcript together with the existing deal state and produce structured deal intelligence that tells the salesperson exactly what to do next.

RULES
1. Be diagnostic, not descriptive. Never just summarize the conversation.
2. Distinguish FACTS (explicitly stated or strongly evidenced) from ASSUMPTIONS (inferred). Set confidence accordingly.
3. Exactly ONE next best action — the single highest-leverage move. Not a generic list.
4. Scores are 0-100, grounded in evidence from the transcript:
   - pain_score: how acute/urgent the pain is
   - champion_score: strength of the internal advocate
   - urgency_score: how soon the prospect needs to change
   - budget_score: budget availability/clarity
   - economic_buyer_score: access to / strength of budget authority
   - competition_score: 100 = strong incumbent/competitor lock-in (risk), 0 = no competition
   - procurement_score: how far along procurement/paperwork is (100 = done)
   - health_score: overall deal health (lower = riskier)
5. known_facts categories are exactly one of: ${FACT_CATEGORIES}. Key is a short label (e.g. "Amount", "Approval time", "Vendor"). Value is one concise phrase.
6. unknowns: list what is still unknown as short strings, e.g. "Economic buyer", "Procurement process", "Decision date". Prefer concrete, decision-relevant unknowns.
7. people: only people actually involved in the deal. relationship values: champion, economic_buyer, decision_maker, blocker, influencer, stakeholder, user. influence: high/medium/low/unknown. sentiment: positive/neutral/negative/unknown. status: engaged, contacted, not_contacted, unresponsive.
8. deal_changes: what changed vs the previous deal state (budget, pain, stage, new competitor, new commitment, etc.). previous = what was known before, current = what the transcript reveals.
9. recommended_message: a short, natural follow-up email that advances the next_best_action. Not a pitch. Body 3-6 sentences, plain text. explanation = why this message.
10. avoid: what the salesperson should NOT do right now (2-4 items).
11. Quotes: 1-3 verbatim, important lines from the prospect.
12. Be concrete: name the person, the budget figure, the approval process. No hedging.`;

const ANALYSIS_SCHEMA = {
  type: "OBJECT",
  properties: {
    summary: { type: "STRING" },
    stage: { type: "STRING", enum: ["discovery", "pain", "champion", "evaluation", "executive_buyin", "technical_validation", "procurement", "closed"] },
    health_score: { type: "INTEGER", minimum: 0, maximum: 100 },
    pain_score: { type: "INTEGER", minimum: 0, maximum: 100 },
    champion_score: { type: "INTEGER", minimum: 0, maximum: 100 },
    urgency_score: { type: "INTEGER", minimum: 0, maximum: 100 },
    budget_score: { type: "INTEGER", minimum: 0, maximum: 100 },
    economic_buyer_score: { type: "INTEGER", minimum: 0, maximum: 100 },
    competition_score: { type: "INTEGER", minimum: 0, maximum: 100 },
    procurement_score: { type: "INTEGER", minimum: 0, maximum: 100 },
    known_facts: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          category: { type: "STRING", enum: FACT_CATEGORIES.split(", ") },
          key: { type: "STRING" },
          value: { type: "STRING" },
          confidence: { type: "STRING", enum: ["known", "assumed"] },
        },
        required: ["category", "key", "value"],
      },
    },
    unknowns: { type: "ARRAY", items: { type: "STRING" } },
    people: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          role: { type: "STRING" },
          relationship: { type: "STRING" },
          influence: { type: "STRING" },
          sentiment: { type: "STRING" },
          status: { type: "STRING" },
          notes: { type: "STRING" },
        },
        required: ["name"],
      },
    },
    risks: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          title: { type: "STRING" },
          severity: { type: "STRING", enum: ["high", "medium", "low"] },
          description: { type: "STRING" },
        },
        required: ["title", "severity"],
      },
    },
    buying_signals: { type: "ARRAY", items: { type: "STRING" } },
    objections: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { title: { type: "STRING" }, description: { type: "STRING" } },
        required: ["title"],
      },
    },
    quotes: { type: "ARRAY", items: { type: "STRING" } },
    next_best_action: {
      type: "OBJECT",
      properties: {
        title: { type: "STRING" },
        description: { type: "STRING" },
        reason: { type: "STRING" },
        priority: { type: "STRING", enum: ["high", "medium", "low"] },
        timing: { type: "STRING" },
      },
      required: ["title", "reason", "priority"],
    },
    recommended_message: {
      type: "OBJECT",
      properties: {
        subject: { type: "STRING" },
        body: { type: "STRING" },
        explanation: { type: "STRING" },
      },
      required: ["body"],
    },
    deal_changes: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          field: { type: "STRING" },
          previous: { type: "STRING" },
          current: { type: "STRING" },
          source: { type: "STRING" },
        },
        required: ["field", "current"],
      },
    },
    avoid: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["summary", "stage", "health_score", "known_facts", "unknowns", "people", "risks", "next_best_action"],
};

function buildPrompt(ctx: AnalyzeContext): string {
  const parts: string[] = [];
  parts.push("## Existing deal state");
  parts.push(
    [
      `Company: ${ctx.companyName ?? "Unknown"}`,
      `Contact: ${ctx.contactName ?? "Unknown"}${ctx.contactRole ? ` (${ctx.contactRole})` : ""}`,
      `Current stage: ${ctx.stage ?? "discovery"}`,
      ctx.healthScore != null ? `Deal health: ${ctx.healthScore}/100` : null,
      ctx.dealValue != null ? `Deal value: $${ctx.dealValue}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
  );

  if (ctx.knownFacts?.length) {
    parts.push("### Facts already known");
    parts.push(
      ctx.knownFacts
        .map((f) => `- [${f.confidence}] ${f.category}/${f.key}: ${f.value}`)
        .join("\n"),
    );
  } else {
    parts.push("### Facts already known\n- (none)");
  }

  if (ctx.people?.length) {
    parts.push("### People involved");
    parts.push(
      ctx.people
        .map((p) => `- ${p.name}${p.role ? ` — ${p.role}` : ""}${p.relationship ? ` (${p.relationship})` : ""}`)
        .join("\n"),
    );
  }

  if (ctx.previousSummary) {
    parts.push(`### Summary of previous analysis\n${ctx.previousSummary}`);
  }
  if (ctx.pastActions?.length) {
    parts.push(
      "### Past recommended actions\n" +
        ctx.pastActions.map((a) => `- [${a.status}] ${a.title}`).join("\n"),
    );
  }

  parts.push(`## New transcript${ctx.transcriptTitle ? ` (${ctx.transcriptTitle})` : ""}`);
  parts.push(ctx.transcript.slice(0, 60000));
  parts.push("Return the structured analysis JSON.");
  return parts.join("\n\n");
}

/**
 * Analyze a transcript together with existing deal state.
 * Uses Gemini structured output; falls back to a deterministic local
 * analysis when no API key is configured (AI_PROVIDER=mock or missing key).
 * Returns the analysis plus the model/provider that produced it.
 */
export async function analyzeDealTranscript(
  ctx: AnalyzeContext,
): Promise<{ analysis: DealAnalysis; model: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  const provider = process.env.AI_PROVIDER ?? "gemini";
  if (provider === "gemini" && apiKey) {
    try {
      return await analyzeWithGemini(ctx, apiKey);
    } catch (err) {
      console.error("Sales analysis via Gemini failed, falling back to local:", err);
      return { analysis: analyzeLocally(ctx), model: "local" };
    }
  }
  return { analysis: analyzeLocally(ctx), model: "local" };
}

async function analyzeWithGemini(
  ctx: AnalyzeContext,
  apiKey: string,
): Promise<{ analysis: DealAnalysis; model: string }> {
  const model = process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite";
  const url = `${API_BASE}/models/${model}:generateContent?key=${apiKey}`;

  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: "user", parts: [{ text: buildPrompt(ctx) }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 8192,
            responseMimeType: "application/json",
            responseSchema: ANALYSIS_SCHEMA,
          },
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Gemini API error ${res.status}: ${body.slice(0, 400)}`);
      }

      const data = await res.json();
      const rawText =
        data?.candidates?.[0]?.content?.parts
          ?.map((part: { text?: string }) => part.text ?? "")
          .filter(Boolean)
          .join("\n") ?? "";
      if (!rawText) throw new Error("Gemini returned an empty response");

      const json = parseJsonLoose(rawText);
      return { analysis: normalizeAnalysis(json, ctx), model };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < 3) await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  throw lastError;
}

/** Normalize raw model JSON into a safe DealAnalysis. */
function normalizeAnalysis(json: any, ctx: AnalyzeContext): DealAnalysis {
  const num = (v: any, dflt = 50) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : dflt;
  };
  const str = (v: any, dflt = "") => (typeof v === "string" ? v : dflt);
  const arr = (v: any): any[] => (Array.isArray(v) ? v : []);
  const obj = (v: any): any => (v && typeof v === "object" ? v : {});

  return {
    summary: str(json.summary),
    stage: typeof json.stage === "string" ? json.stage : (ctx.stage ?? "discovery"),
    health_score: num(json.health_score),
    pain_score: num(json.pain_score),
    champion_score: num(json.champion_score),
    urgency_score: num(json.urgency_score),
    budget_score: num(json.budget_score),
    economic_buyer_score: num(json.economic_buyer_score),
    competition_score: num(json.competition_score),
    procurement_score: num(json.procurement_score),
    known_facts: arr(json.known_facts)
      .map((f: any) => ({
        category: str(f.category).toLowerCase() || "pain",
        key: str(f.key, "Detail"),
        value: str(f.value, "—"),
        confidence: f.confidence === "assumed" ? ("assumed" as const) : ("known" as const),
      }))
      .slice(0, 40),
    unknowns: arr(json.unknowns).map((u) => str(u)).filter(Boolean).slice(0, 20),
    people: arr(json.people)
      .map((p: any) => ({
        name: str(p.name),
        role: str(p.role) || null,
        relationship: str(p.relationship) || null,
        influence: str(p.influence) || null,
        sentiment: str(p.sentiment) || null,
        status: str(p.status) || null,
        notes: str(p.notes) || null,
      }))
      .filter((p) => p.name)
      .slice(0, 20),
    risks: arr(json.risks)
      .map((r: any) => ({
        title: str(r.title, "Risk"),
        severity: ["high", "medium", "low"].includes(r.severity) ? r.severity : "medium",
        description: str(r.description) || null,
      }))
      .slice(0, 15),
    buying_signals: arr(json.buying_signals).map((b) => str(b)).filter(Boolean).slice(0, 10),
    objections: arr(json.objections)
      .map((o: any) => ({ title: str(o.title, "Objection"), description: str(o.description) || null }))
      .slice(0, 10),
    quotes: arr(json.quotes).map((q) => str(q)).filter(Boolean).slice(0, 5),
    next_best_action: {
      title: str(obj(json.next_best_action).title, "Confirm the next step with the champion"),
      description: str(obj(json.next_best_action).description) || null,
      reason: str(obj(json.next_best_action).reason, "Advance the deal based on the transcript."),
      priority: ["high", "medium", "low"].includes(obj(json.next_best_action).priority)
        ? obj(json.next_best_action).priority
        : "medium",
      timing: str(obj(json.next_best_action).timing) || null,
    },
    recommended_message: {
      subject: str(obj(json.recommended_message).subject) || null,
      body: str(obj(json.recommended_message).body, "Following up on our conversation — happy to pick this up whenever suits."),
      explanation: str(obj(json.recommended_message).explanation) || null,
    },
    deal_changes: arr(json.deal_changes)
      .map((c: any) => ({
        field: str(c.field, "Deal"),
        previous: str(c.previous) || null,
        current: str(c.current, "—"),
        source: str(c.source) || null,
      }))
      .slice(0, 15),
    avoid: arr(json.avoid).map((a) => str(a)).filter(Boolean).slice(0, 6),
  };
}

function parseJsonLoose(raw: string): any {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  const start = text.indexOf("{");
  if (start >= 0) {
    let depth = 0, inString = false, escaped = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') inString = false;
      } else if (ch === '"') inString = true;
      else if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) text = text.slice(start, i + 1);
      }
    }
  }
  return JSON.parse(text);
}

export interface MessageContext {
  companyName?: string;
  contactName?: string;
  contactRole?: string;
  stage?: string;
  knownFacts?: { category: string; key: string; value: string; confidence: string }[];
  people?: { name: string; role?: string | null; relationship?: string | null }[];
  analysis?: DealAnalysis | null;
}

/**
 * Generate a concise follow-up message for the current deal context.
 * Uses Gemini; falls back to the recommended message from the last analysis.
 */
export async function generateFollowUpMessage(
  ctx: MessageContext,
): Promise<DealAnalysis["recommended_message"]> {
  const apiKey = process.env.GEMINI_API_KEY;
  const provider = process.env.AI_PROVIDER ?? "gemini";
  if (provider === "gemini" && apiKey) {
    try {
      return await generateWithGemini(ctx, apiKey);
    } catch (err) {
      console.error("Message generation failed, using stored message:", err);
    }
  }
  return fallbackMessage(ctx);
}

async function generateWithGemini(
  ctx: MessageContext,
  apiKey: string,
): Promise<DealAnalysis["recommended_message"]> {
  const model = process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite";
  const url = `${API_BASE}/models/${model}:generateContent?key=${apiKey}`;
  const contact = ctx.contactName ?? ctx.people?.find((p) => p.relationship === "champion")?.name ?? "them";

  const factsText = (ctx.knownFacts ?? [])
    .map((f) => `- ${f.category}/${f.key}: ${f.value}`)
    .join("\n");

  const prompt = `Write a short, natural follow-up email to ${contact} for the ${ctx.companyName ?? "this"} deal (stage: ${ctx.stage ?? "unknown"}). The goal of this email is to advance this next best action: "${ctx.analysis?.next_best_action?.title ?? "keep the deal moving"}".

Context facts:
${factsText || "- (none)"}

Rules:
- 3-6 sentences, plain text, no subject line required but keep one.
- Reference something specific from the conversation (the pain, budget, or next step).
- Ask one clear, low-effort question that advances the action.
- Not a pitch. No jargon.

Return JSON: {"subject": "...", "body": "...", "explanation": "one sentence why this message works"} `;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.5,
        maxOutputTokens: 1024,
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            subject: { type: "STRING" },
            body: { type: "STRING" },
            explanation: { type: "STRING" },
          },
          required: ["subject", "body", "explanation"],
        },
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gemini API error ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  const rawText =
    data?.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part.text ?? "")
      .filter(Boolean)
      .join("\n") ?? "";
  if (!rawText) throw new Error("Gemini returned an empty message");
  const json = parseJsonLoose(rawText);
  return {
    subject: typeof json.subject === "string" ? json.subject : null,
    body: typeof json.body === "string" ? json.body : (ctx.analysis?.recommended_message?.body ?? ""),
    explanation: typeof json.explanation === "string" ? json.explanation : null,
  };
}

function fallbackMessage(ctx: MessageContext): DealAnalysis["recommended_message"] {
  const stored = ctx.analysis?.recommended_message;
  if (stored?.body) return stored;
  const contact = ctx.contactName ?? ctx.people?.find((p) => p.relationship === "champion")?.name ?? "there";
  return {
    subject: "Next steps",
    body: `Hi ${contact},\n\nFollowing up on our last conversation — I'd like to keep things moving. Would it work to set up a short call this week to agree on next steps?\n\nBest,`,
    explanation: "A simple, low-pressure check-in that keeps the deal moving forward.",
  };
}

// ── Local deterministic fallback (no API key / mock mode) ─────────────

function analyzeLocally(ctx: AnalyzeContext): DealAnalysis {
  const t = ctx.transcript.toLowerCase();
  const speakers = extractSpeakers(ctx.transcript);
  const champion = ctx.people?.find((p) => p.relationship === "champion")?.name
    ?? speakers.find((s) => !/salesperson|rep|consultant|me|you|assistant/i.test(s))
    ?? ctx.contactName
    ?? "the prospect";

  const money = t.match(/\$?\s?(\d{2,3}(?:[,.]\d{3})*(?:k|K|,?\d{2,3})?)\s?(k|K|thousand)?/);
  const hasBudget = /\bbudget\b|\$\d|\d+\s*k\b|cost\b|pricing|price\b/.test(t);
  const hasPain = /\b(problem|pain|frustrat|slow|takes?\s+.*(week|day)|manual|error|waste|suck|struggle|issue)\b/.test(t);
  const hasCompetitor = /\b(adobe|salesforce|hubspot|oracle|microsoft|sap|competitor|switching from|currently using|replacing)\b/.test(t);
  const hasApproval = /\bapproval|procurement|legal|security review|vendor review|purchase order\b/.test(t);
  const hasExecutive = /\b(vp|chief|cfo|cmo|ceo|executive|board|director of finance)\b/.test(t);
  const hasTimeline = /\b(by next|within|weeks|month|quarter|end of|by q|soon|asap|january|february|march|april|may|june|july|august|september|october|november|december)\b/.test(t);
  const hasObjection = /\b(but |however|too expensive|not sure|concern|worry|risky|don'?t think we need|not the right time|pricing is)\b/.test(t);

  const budget = extractBudget(ctx.transcript);

  const knownFacts = [];
  if (budget) knownFacts.push({ category: "budget", key: "Amount", value: budget, confidence: "known" as const });
  else if (hasBudget) knownFacts.push({ category: "budget", key: "Amount", value: "Discussed but not specified", confidence: "assumed" as const });
  if (hasPain) knownFacts.push({ category: "pain", key: "Core pain", value: firstPain(ctx.transcript), confidence: "known" as const });
  if (hasCompetitor) knownFacts.push({ category: "competitors", key: "Incumbent", value: extractCompetitor(ctx.transcript), confidence: "assumed" as const });
  if (hasTimeline) knownFacts.push({ category: "timeline", key: "Indicated timeline", value: "Discussed", confidence: "assumed" as const });

  const unknowns: string[] = [];
  if (!hasExecutive) unknowns.push("Economic buyer");
  if (!hasApproval) unknowns.push("Procurement process");
  if (!hasTimeline) unknowns.push("Decision date");
  if (!hasBudget) unknowns.push("Budget");

  const risks: { title: string; severity: "high" | "medium" | "low"; description?: string }[] = [];
  if (!hasExecutive) risks.push({ title: "Economic buyer unknown", severity: "high", description: "No access to budget authority yet." });
  if (!hasTimeline) risks.push({ title: "No decision timeline", severity: "medium", description: "Timeline unclear — deal may stall." });
  if (hasObjection) risks.push({ title: "Possible objection raised", severity: "medium", description: "Concern expressed in the call; needs handling." });

  const people = [];
  if (champion && champion !== ctx.contactName) {
    people.push({
      name: champion,
      role: null, relationship: "champion", influence: "high", sentiment: "positive", status: "engaged", notes: null,
    });
  }
  if (ctx.contactName && !people.some((p) => p.name === ctx.contactName)) {
    people.push({
      name: ctx.contactName, role: ctx.contactRole ?? null, relationship: "champion",
      influence: "high", sentiment: "positive", status: "engaged", notes: null,
    });
  }
  if (speakers.length) {
    for (const s of speakers) {
      if (!people.some((p) => p.name === s)) {
        people.push({ name: s, role: null, relationship: "stakeholder", influence: "unknown", sentiment: "neutral", status: "contacted", notes: null });
      }
    }
  }

  const championScore = people.some((p) => p.relationship === "champion") ? 60 : 20;
  const urgency = hasTimeline ? 55 : 30;
  const stage = hasExecutive ? "evaluation" : hasPain ? "pain" : ctx.stage ?? "discovery";

  const nextActionTitle = !hasExecutive
    ? `Get ${champion} to introduce you to the economic buyer`
    : hasApproval
      ? "Confirm the procurement / security review process and owners"
      : `Confirm decision timeline and next meeting with ${champion}`;

  const messageName = champion ?? "there";
  const messageBody = !hasExecutive
    ? `Hi ${messageName},\n\nGreat speaking with you today. Based on what you shared, it sounds like the approval side will be important to get right. To make sure we set this up correctly, it would help to bring the decision-maker on the budget side into the conversation.\n\nWould you be comfortable introducing us?\n\nBest,`
    : `Hi ${messageName},\n\nThanks again for the call. To keep things moving, could we lock in a time to walk through the remaining questions and agree on next steps and timing?\n\nBest,`;

  return {
    summary: `Analyzed the latest conversation with ${champion}. ${hasPain ? "Core pain confirmed. " : ""}${hasBudget ? "Budget discussed. " : "Budget still unclear. "}${hasExecutive ? "Executive involvement mentioned. " : "Economic buyer not yet involved. "}${hasCompetitor ? "A competitor/incumbent is in the picture. " : ""}`,
    stage,
    health_score: Math.round((championScore + (hasPain ? 80 : 50) + urgency + (hasBudget ? 70 : 30) + (hasExecutive ? 80 : 15) + (hasCompetitor ? 45 : 70)) / 6),
    pain_score: hasPain ? 75 : 40,
    champion_score: championScore,
    urgency_score: urgency,
    budget_score: hasBudget ? 65 : 30,
    economic_buyer_score: hasExecutive ? 75 : 15,
    competition_score: hasCompetitor ? 55 : 20,
    procurement_score: hasApproval ? 40 : 5,
    known_facts: knownFacts,
    unknowns,
    people,
    risks,
    buying_signals: hasPain ? ["Pain clearly articulated in the call"] : [],
    objections: hasObjection
      ? [{ title: "Concern expressed during the call", description: "Handle proactively before pushing for next steps." }]
      : [],
    quotes: [],
    next_best_action: {
      title: nextActionTitle,
      description: null,
      reason: hasExecutive
        ? "The deal is progressing but the decision process is unclear — confirm the path before spending more cycles."
        : "You have engagement but no access to budget authority. Another meeting is unlikely to move the deal forward without executive involvement.",
      priority: hasExecutive ? "medium" : "high",
      timing: "Within 48 hours",
    },
    recommended_message: {
      subject: "Next steps",
      body: messageBody,
      explanation: "This keeps momentum without pushing for a decision too early, and invites the prospect to act on the single highest-leverage step.",
    },
    deal_changes: [],
    avoid: ["Don't push for pricing or a demo before the decision process is mapped.", "Don't chase multiple stakeholders at once."],
  };
}

function extractSpeakers(transcript: string): string[] {
  const names = new Set<string>();
  for (const line of transcript.split("\n")) {
    const m = line.match(/^\s*\[([^\]]+)\]\s*/);
    if (m && !/salesperson|rep|consultant|assistant|interviewer|host/i.test(m[1])) {
      const name = m[1].trim().split(/\s+/).slice(0, 2).join(" ");
      if (name) names.add(name);
    }
  }
  return [...names].slice(0, 6);
}

function extractBudget(transcript: string): string | null {
  const m = transcript.match(/(?:up to|around|about|roughly|maybe|somewhere (?:around|in the range of)?)\s*\$\s?(\d[\d,]*(?:\.\d+)?)(k|K| thousand)?/);
  if (m) {
    const n = parseFloat(m[1].replace(/,/g, ""));
    const mult = m[2]?.toLowerCase() === "k" || m[2] === " thousand" ? 1000 : 1;
    return `~$${Math.round(n * mult).toLocaleString()}`;
  }
  return null;
}

function firstPain(transcript: string): string {
  const m = transcript.match(/[^.]*(?:problem|pain|slow|takes\s+\w+\s+(?:weeks?|days?)|manual|frustrat)[^.]*\./i);
  return m ? m[0].trim().slice(0, 160) : "Operational friction described in the call.";
}

function extractCompetitor(transcript: string): string {
  const m = transcript.match(/\b(?:using|with|replace(?:ing)?|evaluate(?:ing)?|moving from|switching from|currently on)\s+([A-Z][A-Za-z]+(?:\s+[A-Za-z]+)?)/);
  const known = transcript.match(/\b(Adobe|Salesforce|HubSpot|Oracle|Microsoft|SAP|Workday|ServiceNow)\b/i);
  return known ? known[1] : (m ? m[1] : "Incumbent solution");
}