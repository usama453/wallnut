interface Risk {
  title: string;
  severity: string;
  description?: string | null;
}

interface Props {
  risks: Risk[];
  buyingSignals: string[];
  objections: { title: string; description?: string | null }[];
  avoid: string[];
  quotes: string[];
}

const riskTone: Record<string, string> = {
  high: "bg-red-50 text-red-700 border-red-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  low: "bg-slate-50 text-slate-600 border-slate-200",
};

export function DealInsights({ risks, buyingSignals, objections, avoid, quotes }: Props) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold tracking-tight text-slate-900">Risks</h2>
        {risks.length ? (
          <ul className="space-y-2">
            {risks.map((r, i) => (
              <li key={i} className={`rounded-lg border px-3 py-2 ${riskTone[r.severity] ?? riskTone.low}`}>
                <div className="text-[13px] font-medium">{r.title}</div>
                {r.description && <div className="mt-0.5 text-xs opacity-80">{r.description}</div>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-400">No risks identified.</p>
        )}

        {quotes.length > 0 && (
          <div className="mt-5 border-t border-slate-100 pt-4">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
              Important quotes
            </h3>
            <ul className="space-y-2">
              {quotes.map((q, i) => (
                <li key={i} className="border-l-2 border-indigo-200 pl-3 text-[13px] italic leading-snug text-slate-600">
                  “{q}”
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="space-y-4">
        {buyingSignals.length > 0 && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5">
            <h2 className="mb-2 text-sm font-semibold tracking-tight text-emerald-800">Buying signals</h2>
            <ul className="space-y-1.5">
              {buyingSignals.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-[13px] text-emerald-900">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-emerald-500" />
                  {s}
                </li>
              ))}
            </ul>
          </div>
        )}

        {objections.length > 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="mb-2 text-sm font-semibold tracking-tight text-slate-900">Objections</h2>
            <ul className="space-y-1.5">
              {objections.map((o, i) => (
                <li key={i} className="text-[13px] text-slate-700">
                  <span className="font-medium">{o.title}</span>
                  {o.description && <span className="text-slate-500"> — {o.description}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {avoid.length > 0 && (
          <div className="rounded-2xl border border-red-100 bg-red-50/40 p-5">
            <h2 className="mb-2 text-sm font-semibold tracking-tight text-red-700">What to avoid</h2>
            <ul className="space-y-1.5">
              {avoid.map((a, i) => (
                <li key={i} className="flex items-start gap-2 text-[13px] text-red-800">
                  <span className="mt-1.5 text-[10px] font-bold text-red-400">✕</span>
                  {a}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}