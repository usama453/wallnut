import type { DealPersonRow } from "@/lib/sales/types";
import { initials } from "@/lib/sales/format";

const relationshipStyles: Record<string, string> = {
  champion: "bg-emerald-50 text-emerald-700",
  economic_buyer: "bg-indigo-50 text-indigo-700",
  decision_maker: "bg-violet-50 text-violet-700",
  blocker: "bg-red-50 text-red-700",
  influencer: "bg-amber-50 text-amber-700",
  stakeholder: "bg-slate-100 text-slate-600",
  user: "bg-slate-100 text-slate-600",
};

const sentimentDot: Record<string, string> = {
  positive: "bg-emerald-500",
  neutral: "bg-slate-400",
  negative: "bg-red-500",
};

function pretty(v: string | null): string {
  if (!v) return "Unknown";
  return v
    .split(/[\s_]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function PeopleList({ people }: { people: DealPersonRow[] }) {
  if (!people.length) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold tracking-tight text-slate-900">People</h2>
        <p className="mt-3 text-sm text-slate-400">
          No people identified yet. Analyze a transcript to map the buying committee.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-tight text-slate-900">People</h2>
        <span className="text-[11px] text-slate-400">Buying committee</span>
      </div>

      <ul className="divide-y divide-slate-100">
        {people.map((p) => {
          const rel = p.relationship ? relationshipStyles[p.relationship] : "bg-slate-100 text-slate-600";
          return (
            <li key={p.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <div className="grid size-9 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                {initials(p.name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[13px] font-medium text-slate-900">{p.name}</span>
                  {p.relationship && (
                    <span className={`shrink-0 rounded px-1.5 py-px text-[10px] font-semibold ${rel}`}>
                      {pretty(p.relationship)}
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-500">{p.role ?? "Role unknown"}</div>
              </div>
              <div className="hidden shrink-0 items-center gap-1.5 text-xs text-slate-500 sm:flex">
                {p.influence && (
                  <span className="text-[11px]">{p.influence === "unknown" ? "Influence unknown" : `${pretty(p.influence)} influence`}</span>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {p.sentiment && (
                  <span className={`size-2 rounded-full ${sentimentDot[p.sentiment] ?? "bg-slate-300"}`} />
                )}
                <span className="w-24 text-right text-[11px] text-slate-500">{pretty(p.status)}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}