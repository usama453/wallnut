import Link from "next/link";
import { notFound } from "next/navigation";
import { getDeal } from "@/lib/sales/queries";
import { DealHeader } from "@/components/navigator/deal-header";
import { StageNav } from "@/components/navigator/stage-nav";
import { NextBestAction } from "@/components/navigator/next-best-action";
import { DealHealth } from "@/components/navigator/deal-health";
import { KnownFacts } from "@/components/navigator/known-facts";
import { PeopleList } from "@/components/navigator/people-list";
import { DealInsights } from "@/components/navigator/deal-insights";
import { ActivityTimeline } from "@/components/navigator/activity-timeline";
import { TranscriptForm } from "@/components/navigator/transcript-form";
import type { DealAnalysis } from "@/lib/sales/types";
import { formatDateTime } from "@/lib/sales/format";

export const dynamic = "force-dynamic";

export default async function DealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getDeal(id);
  if (!detail) notFound();

  const { deal, facts, people, openAction, transcripts, latestAnalysis, activity } = detail;
  const a: DealAnalysis | null = latestAnalysis;

  const scores = a
    ? {
        champion: a.champion_score,
        pain: a.pain_score,
        urgency: a.urgency_score,
        budget: a.budget_score,
        economic_buyer: a.economic_buyer_score,
        competition: a.competition_score,
        procurement: a.procurement_score,
      }
    : {};

  return (
    <div className="space-y-6">
      <Link
        href="/nav/deals"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 transition-colors hover:text-slate-700"
      >
        ← Back to deals
      </Link>

      <DealHeader
        dealId={deal.id}
        companyName={deal.company_name}
        dealValue={deal.deal_value}
        currency={deal.currency}
        stage={deal.stage}
        health={deal.health_score}
        status={deal.status}
        createdAt={deal.created_at}
      />

      <StageNav current={deal.stage} />

      <NextBestAction
        dealId={deal.id}
        action={openAction}
        recommendedMessage={a?.recommended_message}
      />

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <TranscriptForm dealId={deal.id} />

          <KnownFacts facts={facts} />

          <PeopleList people={people} />

          {transcripts.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold tracking-tight text-slate-900">Transcripts</h2>
                <span className="text-[11px] text-slate-400">{transcripts.length} analyzed</span>
              </div>
              <ul className="divide-y divide-slate-100">
                {transcripts.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-medium text-slate-800">{t.title}</div>
                      <div className="truncate text-xs text-slate-400">
                        {t.content.slice(0, 80)}
                        {t.content.length > 80 ? "…" : ""}
                      </div>
                    </div>
                    <span className="shrink-0 text-[11px] text-slate-400">
                      {formatDateTime(t.analyzed_at)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <DealHealth scores={scores} overall={deal.health_score} />

          <DealInsights
            risks={a?.risks ?? []}
            buyingSignals={a?.buying_signals ?? []}
            objections={a?.objections ?? []}
            avoid={a?.avoid ?? []}
            quotes={a?.quotes ?? []}
          />
        </div>
      </div>

      <ActivityTimeline activities={activity} />
    </div>
  );
}