import { createClient } from "@/lib/supabase/server";
import type {
  DealActionRow,
  DealActivityRow,
  DealAnalysis,
  DealAnalysisRow,
  DealFactRow,
  DealPersonRow,
  DealRow,
  DealTranscriptRow,
} from "./types";

export async function listDeals() {
  const supabase = await createClient();
  const { data: deals } = await supabase
    .from("deals")
    .select("*")
    .order("updated_at", { ascending: false });

  const rows: (DealRow & { nextAction: DealActionRow | null })[] = (deals ?? []).map((d) => ({
    ...(d as DealRow),
    nextAction: null,
  }));

  if (rows.length) {
    const ids = rows.map((d) => d.id);
    const { data: actions } = await supabase
      .from("deal_actions")
      .select("*")
      .in("deal_id", ids)
      .eq("status", "open")
      .order("created_at", { ascending: false });
    const byDeal = new Map<string, DealActionRow>();
    for (const a of actions ?? []) {
      if (!byDeal.has(a.deal_id)) byDeal.set(a.deal_id, a as DealActionRow);
    }
    for (const d of rows) d.nextAction = byDeal.get(d.id) ?? null;
  }

  return rows;
}

export interface DealDetail {
  deal: DealRow;
  facts: DealFactRow[];
  people: DealPersonRow[];
  actions: DealActionRow[];
  openAction: DealActionRow | null;
  transcripts: DealTranscriptRow[];
  analyses: DealAnalysisRow[];
  latestAnalysis: DealAnalysis | null;
  activity: DealActivityRow[];
}

export async function getDeal(dealId: string): Promise<DealDetail | null> {
  const supabase = await createClient();
  const { data: deal } = await supabase
    .from("deals")
    .select("*")
    .eq("id", dealId)
    .maybeSingle();
  if (!deal) return null;

  const [
    { data: facts },
    { data: people },
    { data: actions },
    { data: transcripts },
    { data: analyses },
    { data: activity },
  ] = await Promise.all([
    supabase.from("deal_facts").select("*").eq("deal_id", dealId).order("created_at"),
    supabase.from("deal_people").select("*").eq("deal_id", dealId).order("created_at"),
    supabase.from("deal_actions").select("*").eq("deal_id", dealId).order("created_at", { ascending: false }),
    supabase.from("deal_transcripts").select("*").eq("deal_id", dealId).order("created_at", { ascending: false }),
    supabase.from("deal_analyses").select("*").eq("deal_id", dealId).order("created_at", { ascending: false }),
    supabase.from("deal_activity").select("*").eq("deal_id", dealId).order("created_at", { ascending: false }).limit(30),
  ]);

  const openAction = (actions as DealActionRow[] | null)?.find((a) => a.status === "open") ?? null;
  const latest = analyses && analyses[0] ? (analyses[0] as DealAnalysisRow) : null;

  return {
    deal: deal as DealRow,
    facts: (facts as DealFactRow[] | null) ?? [],
    people: (people as DealPersonRow[] | null) ?? [],
    actions: (actions as DealActionRow[] | null) ?? [],
    openAction,
    transcripts: (transcripts as DealTranscriptRow[] | null) ?? [],
    analyses: (analyses as DealAnalysisRow[] | null) ?? [],
    latestAnalysis: latest?.analysis_json ?? null,
    activity: (activity as DealActivityRow[] | null) ?? [],
  };
}

export async function listActivity(limit = 40) {
  const supabase = await createClient();
  const { data: activities } = await supabase
    .from("deal_activity")
    .select("*, deals(company_name)")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (activities ?? []) as (DealActivityRow & { deals: { company_name: string } | null })[];
}

export type { DealAnalysis };