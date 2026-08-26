import { HEALTH_DIMENSIONS } from "@/lib/sales/stages";

export interface HealthScores {
  champion: number;
  pain: number;
  urgency: number;
  budget: number;
  economic_buyer: number;
  competition: number;
  procurement: number;
}

const scoreColor = (v: number) =>
  v >= 70 ? "bg-emerald-500" : v >= 45 ? "bg-amber-500" : "bg-red-500";

const scoreText = (v: number) =>
  v >= 70 ? "text-emerald-600" : v >= 45 ? "text-amber-600" : "text-red-600";

export function DealHealth({ scores, overall }: { scores: Partial<HealthScores>; overall?: number | null }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-tight text-slate-900">Deal health</h2>
        {overall != null && (
          <span className="text-xs text-slate-400">Overall {overall}%</span>
        )}
      </div>
      <div className="space-y-3.5">
        {HEALTH_DIMENSIONS.map((d) => {
          const v = scores[d.key] ?? 0;
          return (
            <div key={d.key}>
              <div className="mb-1 flex items-baseline justify-between">
                <span className="text-[13px] text-slate-600">{d.label}</span>
                <span className={`text-[13px] font-semibold ${scoreText(v)}`}>{v}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full transition-all ${scoreColor(v)}`}
                  style={{ width: `${Math.min(100, Math.max(0, v))}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}