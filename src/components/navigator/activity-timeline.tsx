import type { DealActivityRow } from "@/lib/sales/types";
import { formatDateTime } from "@/lib/sales/format";

const typeStyle: Record<string, { dot: string; label: string }> = {
  call_analyzed: { dot: "bg-indigo-500", label: "Analyzed" },
  fact_changed: { dot: "bg-sky-500", label: "Changed" },
  stage_changed: { dot: "bg-emerald-500", label: "Stage" },
  action_recommended: { dot: "bg-violet-500", label: "Recommended" },
  action_completed: { dot: "bg-emerald-500", label: "Done" },
  note: { dot: "bg-slate-400", label: "Note" },
};

export function ActivityTimeline({ activities }: { activities: DealActivityRow[] }) {
  if (!activities.length) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold tracking-tight text-slate-900">History</h2>
        <p className="mt-3 text-sm text-slate-400">
          Nothing recorded yet. Analyzing transcripts builds the deal memory timeline.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-tight text-slate-900">History</h2>
        <span className="text-[11px] text-slate-400">Deal memory</span>
      </div>

      <ol className="relative ml-1 space-y-4 border-l border-slate-200 pl-5">
        {activities.map((a) => {
          const style = typeStyle[a.type] ?? typeStyle.note;
          return (
            <li key={a.id} className="relative">
              <span
                className={`absolute -left-[26px] top-1 grid size-4 place-items-center rounded-full border-2 border-white ${style.dot}`}
              >
                <span className="size-1 rounded-full bg-white" />
              </span>
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-[13px] font-medium text-slate-800">{a.title}</span>
                <span className="text-[11px] text-slate-400">{formatDateTime(a.created_at)}</span>
              </div>
              {a.detail && <p className="mt-0.5 text-[13px] leading-snug text-slate-500">{a.detail}</p>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}