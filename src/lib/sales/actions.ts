"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { analyzeDealTranscript, generateFollowUpMessage } from "./analyze";
import { applyAnalysisToDeal } from "./merge";
import type { DealAnalysis } from "./types";

export interface NewDealInput {
  company_name: string;
  contact_name?: string;
  contact_role?: string;
  deal_value?: number | null;
  currency?: string;
  stage?: string;
}

export async function createDeal(input: NewDealInput): Promise<{ id: string }> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("deals")
    .insert({
      company_name: input.company_name.trim(),
      contact_name: input.contact_name?.trim() || null,
      contact_role: input.contact_role?.trim() || null,
      deal_value: input.deal_value ?? null,
      currency: input.currency ?? "USD",
      stage: input.stage ?? "discovery",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not create deal");
  revalidatePath("/nav");
  return { id: data.id };
}

export interface UpdateDealInput {
  contact_name?: string | null;
  contact_role?: string | null;
  deal_value?: number | null;
  currency?: string;
  stage?: string;
  status?: string;
}

export async function updateDeal(dealId: string, input: UpdateDealInput): Promise<void> {
  const supabase = await createAdminClient();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.contact_name !== undefined) patch.contact_name = input.contact_name || null;
  if (input.contact_role !== undefined) patch.contact_role = input.contact_role || null;
  if (input.deal_value !== undefined) patch.deal_value = input.deal_value;
  if (input.currency !== undefined) patch.currency = input.currency;
  if (input.stage !== undefined) patch.stage = input.stage;
  if (input.status !== undefined) patch.status = input.status;
  const { error } = await supabase.from("deals").update(patch).eq("id", dealId);
  if (error) throw new Error(error.message);
  revalidatePath(`/nav/deals/${dealId}`);
  revalidatePath("/nav");
}

/** The core loop: analyze a transcript + existing deal state, merge into the deal. */
export async function analyzeDeal(
  dealId: string,
  transcript: string,
  title?: string,
): Promise<{ analysis: DealAnalysis; model: string }> {
  const supabase = await createAdminClient();
  const { data: deal } = await supabase.from("deals").select("*").eq("id", dealId).maybeSingle();
  if (!deal) throw new Error("Deal not found");

  const [{ data: facts }, { data: people }, { data: latestAnalysis }, { data: pastActions }] =
    await Promise.all([
      supabase.from("deal_facts").select("*").eq("deal_id", dealId).order("created_at"),
      supabase.from("deal_people").select("*").eq("deal_id", dealId),
      supabase
        .from("deal_analyses")
        .select("analysis_json")
        .eq("deal_id", dealId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from("deal_actions").select("title,status").eq("deal_id", dealId).order("created_at", { ascending: false }).limit(5),
    ]);

  const { analysis, model } = await analyzeDealTranscript({
    companyName: deal.company_name,
    contactName: deal.contact_name ?? undefined,
    contactRole: deal.contact_role ?? undefined,
    stage: deal.stage,
    healthScore: deal.health_score,
    dealValue: deal.deal_value,
    knownFacts: facts ?? [],
    people: people ?? [],
    previousSummary: (latestAnalysis?.analysis_json as DealAnalysis | undefined)?.summary ?? null,
    pastActions: pastActions ?? [],
    transcriptTitle: title,
    transcript,
  });

  await applyAnalysisToDeal({
    dealId,
    transcriptContent: transcript,
    transcriptTitle: title,
    analysis,
    model,
  });

  revalidatePath(`/nav/deals/${dealId}`);
  revalidatePath("/nav");
  return { analysis, model };
}

export async function completeAction(actionId: string): Promise<void> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("deal_actions")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", actionId)
    .select("deal_id,title")
    .single();
  if (error) throw new Error(error.message);
  if (data) {
    await supabase.from("deal_activity").insert({
      deal_id: data.deal_id,
      type: "action_completed",
      title: `Action completed: ${data.title}`,
      detail: null,
      meta: { action_id: actionId },
    });
    revalidatePath(`/nav/deals/${data.deal_id}`);
    revalidatePath("/nav");
  }
}

export async function regenerateMessage(
  dealId: string,
): Promise<DealAnalysis["recommended_message"]> {
  const supabase = await createAdminClient();
  const { data: deal } = await supabase.from("deals").select("*").eq("id", dealId).maybeSingle();
  if (!deal) throw new Error("Deal not found");

  const [{ data: facts }, { data: people }, { data: latestAnalysis }] = await Promise.all([
    supabase.from("deal_facts").select("*").eq("deal_id", dealId),
    supabase.from("deal_people").select("*").eq("deal_id", dealId),
    supabase
      .from("deal_analyses")
      .select("analysis_json")
      .eq("deal_id", dealId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const previous = latestAnalysis?.analysis_json as DealAnalysis | undefined;
  return generateFollowUpMessage({
    companyName: deal.company_name,
    contactName: deal.contact_name ?? undefined,
    stage: deal.stage,
    knownFacts: facts ?? [],
    people: people ?? [],
    analysis: previous,
  });
}