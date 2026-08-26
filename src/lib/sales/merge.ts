import { createAdminClient } from "@/lib/supabase/server";
import type { DealAnalysis } from "./types";

interface ApplyParams {
  dealId: string;
  transcriptContent: string;
  transcriptTitle?: string;
  analysis: DealAnalysis;
  model: string;
}

const ACTIVITY_TYPES = {
  callAnalyzed: "call_analyzed",
  factChanged: "fact_changed",
  stageChanged: "stage_changed",
  actionRecommended: "action_recommended",
  actionCompleted: "action_completed",
} as const;

/**
 * Apply a structured analysis to the deal, preserving deal memory:
 * the analysis updates the existing deal rather than replacing it.
 * Every meaningful change is logged to the activity timeline.
 */
export async function applyAnalysisToDeal(params: ApplyParams): Promise<void> {
  const { dealId, transcriptContent, transcriptTitle, analysis, model } = params;
  const supabase = await createAdminClient();

  const { data: deal } = await supabase.from("deals").select("*").eq("id", dealId).maybeSingle();
  if (!deal) throw new Error("Deal not found");

  const { data: transcript } = await supabase
    .from("deal_transcripts")
    .insert({
      deal_id: dealId,
      title: transcriptTitle ?? "Call transcript",
      content: transcriptContent,
      analyzed_at: new Date().toISOString(),
    })
    .select()
    .single();

  const transcriptId = transcript?.id ?? null;

  // 1. Update deal snapshot
  const newBudget = findBudgetAmount(analysis);
  const dealValue = Math.max(deal.deal_value ?? 0, newBudget ?? 0) || null;
  const stageChanged = deal.stage !== analysis.stage;
  const mainRisk = pickMainRisk(analysis);

  const { data: updatedDeal } = await supabase
    .from("deals")
    .update({
      stage: analysis.stage,
      health_score: analysis.health_score,
      summary: analysis.summary || deal.summary,
      main_risk: mainRisk,
      deal_value: dealValue,
      updated_at: new Date().toISOString(),
    })
    .eq("id", dealId)
    .select()
    .single();

  // 2. People
  if (analysis.people.length) {
    const rows = analysis.people.map((p) => ({
      deal_id: dealId,
      name: p.name,
      role: p.role ?? null,
      relationship: p.relationship ?? null,
      influence: p.influence ?? null,
      sentiment: p.sentiment ?? null,
      status: p.status ?? null,
      notes: p.notes ?? null,
    }));
    await supabase.from("deal_people").upsert(rows, { onConflict: "deal_id,name" });
  }

  // 3. Facts — known + assumed, then explicit unknowns
  const factRows: {
    deal_id: string;
    category: string;
    key: string;
    value: string;
    confidence: string;
    source: string | null;
  }[] = analysis.known_facts.map((f) => ({
    deal_id: dealId,
    category: f.category,
    key: f.key,
    value: f.value,
    confidence: f.confidence ?? "known",
    source: transcriptTitle ?? null,
  }));
  for (const u of analysis.unknowns) {
    const category = categoryFromUnknown(u);
    if (category) {
      factRows.push({
        deal_id: dealId,
        category,
        key: u,
        value: "Unknown",
        confidence: "unknown",
        source: null,
      });
    }
  }
  if (factRows.length) {
    await supabase.from("deal_facts").upsert(factRows, { onConflict: "deal_id,category,key" });
  }

  // 4. Supersede previous open actions, create the new next best action
  const { data: openActions } = await supabase
    .from("deal_actions")
    .select("id")
    .eq("deal_id", dealId)
    .eq("status", "open");
  if (openActions?.length) {
    await supabase
      .from("deal_actions")
      .update({ status: "superseded" })
      .in("id", openActions.map((a) => a.id));
  }

  const nba = analysis.next_best_action;
  if (nba?.title) {
    await supabase.from("deal_actions").insert({
      deal_id: dealId,
      title: nba.title,
      description: nba.description ?? null,
      reason: nba.reason ?? null,
      priority: nba.priority ?? "medium",
      timing: nba.timing ?? null,
      status: "open",
    });
    await addActivity(supabase, dealId, ACTIVITY_TYPES.actionRecommended, `Recommended: ${nba.title}`, nba.reason ?? null, {
      priority: nba.priority ?? "medium",
      timing: nba.timing ?? null,
    });
  }

  // 5. Activity timeline
  await addActivity(
    supabase,
    dealId,
    ACTIVITY_TYPES.callAnalyzed,
    `Call analyzed${transcriptTitle ? ` — ${transcriptTitle}` : ""}`,
    analysis.summary || "Transcript analyzed.",
    { health_score: analysis.health_score, stage: analysis.stage },
  );

  if (stageChanged && updatedDeal) {
    await addActivity(
      supabase,
      dealId,
      ACTIVITY_TYPES.stageChanged,
      `Stage changed: ${label(deal.stage)} → ${label(updatedDeal.stage)}`,
      null,
      { from: deal.stage, to: updatedDeal.stage },
    );
  }

  for (const change of analysis.deal_changes) {
    await addActivity(
      supabase,
      dealId,
      ACTIVITY_TYPES.factChanged,
      `${labelField(change.field)}: ${change.previous ?? "—"} → ${change.current}`,
      change.source ?? null,
      { field: change.field, previous: change.previous ?? null, current: change.current },
    );
  }

  // 6. Store the structured analysis
  await supabase.from("deal_analyses").insert({
    deal_id: dealId,
    transcript_id: transcriptId,
    stage: analysis.stage,
    health_score: analysis.health_score,
    analysis_json: analysis as unknown as Record<string, unknown>,
    model,
  });
}

/** Helper for deal_activity inserts (timestamps auto-set). */
async function addActivity(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  dealId: string,
  type: string,
  title: string,
  detail: string | null,
  meta: Record<string, unknown>,
) {
  await supabase.from("deal_activity").insert({
    deal_id: dealId,
    type,
    title,
    detail,
    meta,
  });
}

function findBudgetAmount(analysis: DealAnalysis): number | null {
  const budget = analysis.known_facts.find((f) => f.category === "budget");
  if (!budget) return null;
  const m = budget.value.match(/\$\s?([\d,]+(?:\.\d+)?)\s*(k|K| thousand|m|M| million)?/);
  if (!m) return null;
  let n = parseFloat(m[1].replace(/,/g, ""));
  const unit = (m[2] ?? "").toLowerCase();
  if (unit.startsWith("k") || unit === " thousand") n *= 1000;
  if (unit.startsWith("m") || unit === " million") n *= 1_000_000;
  return Number.isFinite(n) && n > 0 ? n : null;
}

function pickMainRisk(analysis: DealAnalysis): string | null {
  const order = { high: 0, medium: 1, low: 2 } as const;
  const sorted = [...analysis.risks].sort((a, b) => order[a.severity] - order[b.severity]);
  return sorted[0]?.title ?? null;
}

/** Map a free-text unknown to a fact category when it matches a known one. */
function categoryFromUnknown(u: string): string | null {
  const map: [RegExp, string][] = [
    [/economic buyer|budget holder|decision maker|executive/i, "economic_buyer"],
    [/procurement|vendor review|purchase order|security review/i, "procurement"],
    [/decision date|timeline|date|when/i, "decision_date"],
    [/budget|amount|funding/i, "budget"],
    [/champion|advocate|internal sponsor/i, "champion"],
    [/criteria|evaluation criteria/i, "decision_criteria"],
  ];
  for (const [re, cat] of map) if (re.test(u)) return cat;
  return null;
}

function label(id: string): string {
  return id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function labelField(field: string): string {
  return field
    .split(/[\s_]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export { ACTIVITY_TYPES };