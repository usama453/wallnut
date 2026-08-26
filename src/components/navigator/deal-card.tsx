import Link from "next/link";
import type { DealActionRow, DealRow } from "@/lib/sales/types";
import { formatMoney, healthTone, initials, relativeTime } from "@/lib/sales/format";
import { stageLabel } from "@/lib/sales/stages";

export interface DealCardData {
  deal: DealRow;
  nextAction: DealActionRow | null;
}

export function DealCard({ deal, nextAction }: DealCardData) {
  const tone = healthTone(deal.health_score);

  return (
    <Link
      href={`/nav/deals/${deal.id}`}
      className="group block rounded-2xl border border-slate-200 bg-white p-5 transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-xs font-semibold text-slate-500">
              {initials(deal.company_name)}
            </div>
            <div className="min-w-0">
              <h3 className="truncate font-semibold tracking-tight text-slate-900">
                {deal.company_name}
              </h3>
              <p className="truncate text-xs text-slate-500">
                {deal.contact_name ?? "No contact yet"}
                {deal.contact_role ? ` · ${deal.contact_role}` : ""}
              </p>
            </div>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-lg font-semibold tracking-tight text-slate-900">
            {formatMoney(deal.deal_value, deal.currency)}
          </div>
          <div className="text-[11px] text-slate-400">Deal value</div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
          {stageLabel(deal.stage)}
        </span>
        <span className={`text-sm font-bold ${tone.text}`}>
          {deal.health_score ?? "—"}% health
        </span>
        <span className="ml-auto text-[11px] text-slate-400">
          {relativeTime(deal.updated_at)}
        </span>
      </div>

      <div className="mt-4 space-y-1.5 border-t border-slate-100 pt-3">
        <div className="flex items-start gap-2 text-[13px]">
          <span className="mt-0.5 shrink-0 rounded bg-indigo-50 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-indigo-600">
            Next
          </span>
          <span className="line-clamp-1 text-slate-700">
            {nextAction?.title ?? "No action yet — analyze a transcript"}
          </span>
        </div>
        <div className="flex items-start gap-2 text-[13px]">
          <span className="mt-0.5 shrink-0 rounded bg-red-50 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-red-600">
            Risk
          </span>
          <span className="line-clamp-1 text-slate-500">{deal.main_risk ?? "No known risks"}</span>
        </div>
      </div>
    </Link>
  );
}