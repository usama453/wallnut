import type { DealFactRow } from "@/lib/sales/types";
import { FACT_CATEGORIES } from "@/lib/sales/stages";

interface Props {
  facts: DealFactRow[];
}

/**
 * "What we know" — renders the curated fact categories, showing explicit
 * "Unknown" states so the AI distinguishes facts from gaps.
 */
export function KnownFacts({ facts }: Props) {
  const byCategory = new Map<string, DealFactRow[]>();
  for (const f of facts) {
    const list = byCategory.get(f.category) ?? [];
    list.push(f);
    byCategory.set(f.category, list);
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-tight text-slate-900">What we know</h2>
        <span className="text-[11px] text-slate-400">Facts vs gaps</span>
      </div>

      <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
        {FACT_CATEGORIES.map((cat) => {
          const rows = (byCategory.get(cat.key) ?? []).filter((f) => f.confidence !== "unknown");
          const unknown = (byCategory.get(cat.key) ?? []).find((f) => f.confidence === "unknown");

          if (!rows.length && !unknown) {
            return (
              <div key={cat.key}>
                <dt className="text-[13px] font-medium text-slate-500">{cat.label}</dt>
                <dd className="mt-0.5 text-[13px] italic text-slate-400">—</dd>
              </div>
            );
          }

          return (
            <div key={cat.key}>
              <dt className="text-[13px] font-medium text-slate-500">{cat.label}</dt>
              <dd className="mt-0.5 space-y-1">
                {rows.map((f) => (
                  <p key={f.id} className="text-[13px] leading-snug text-slate-800">
                    {f.confidence === "assumed" && <em className="mr-1 text-slate-400">(assumed)</em>}
                    {f.key && f.key !== cat.label ? (
                      <>
                        <span className="font-medium text-slate-600">{f.key}: </span>
                        {f.value}
                      </>
                    ) : (
                      f.value
                    )}
                  </p>
                ))}
                {unknown && (
                  <p className="flex items-center gap-1.5 text-[13px] text-slate-400">
                    <span className="inline-block size-1.5 rounded-full bg-amber-400" />
                    <em>{unknown.key}: Unknown</em>
                  </p>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}