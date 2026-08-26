import { STAGES, stageIndex } from "@/lib/sales/stages";

export function StageNav({ current }: { current: string }) {
  const idx = stageIndex(current);
  const currentIdx = idx >= 0 ? idx : 0;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-tight text-slate-900">Deal navigation</h2>
        <span className="text-[11px] text-slate-400">Sales process</span>
      </div>

      <div className="flex items-start">
        {STAGES.map((stage, i) => {
          const isCurrent = i === currentIdx;
          const isPast = i < currentIdx;
          const isClosed = stage.id === "closed";
          return (
            <div key={stage.id} className="flex flex-1 items-start last:flex-none">
              <div className="flex flex-1 flex-col items-center gap-2 text-center">
                <div
                  className={`relative grid size-9 place-items-center rounded-full border-2 text-xs font-semibold transition-colors ${
                    isCurrent
                      ? "border-indigo-600 bg-indigo-600 text-white ring-4 ring-indigo-100"
                      : isPast
                        ? "border-emerald-500 bg-emerald-50 text-emerald-600"
                        : "border-slate-200 bg-white text-slate-400"
                  } ${isClosed && !isCurrent ? "border-slate-900 bg-slate-900 text-white" : ""}`}
                >
                  {isClosed ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="size-4">
                      <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    i + 1
                  )}
                  {isCurrent && (
                    <span className="absolute -top-8 whitespace-nowrap rounded-md bg-slate-900 px-2 py-0.5 text-[10px] font-semibold text-white">
                      YOU ARE HERE
                    </span>
                  )}
                </div>
                <div
                  className={`text-center text-[11px] leading-tight ${
                    isCurrent ? "font-semibold text-slate-900" : isPast ? "text-slate-500" : "text-slate-400"
                  }`}
                >
                  {stage.label}
                </div>
              </div>

              {i < STAGES.length - 1 && (
                <div className="mt-4 flex flex-1 items-center">
                  <div className={`h-0.5 flex-1 rounded ${i < currentIdx ? "bg-emerald-400" : "bg-slate-200"}`} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}