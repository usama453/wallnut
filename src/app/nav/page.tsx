import Link from "next/link";
import { listDeals } from "@/lib/sales/queries";
import { DealCard } from "@/components/navigator/deal-card";
import { formatMoney, healthTone } from "@/lib/sales/format";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const deals = await listDeals();

  const pipeline = deals
    .filter((d) => d.status === "open")
    .reduce((sum, d) => sum + (d.deal_value ?? 0), 0);

  const avgHealth = deals.length
    ? Math.round(deals.reduce((s, d) => s + (d.health_score ?? 0), 0) / deals.length)
    : 0;

  const highPriority = deals.filter((d) => d.nextAction?.priority === "high").length;

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">
            Your deals, their health, and the single best next move.
          </p>
        </div>
        <Link
          href="/nav/deals/new"
          className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500"
        >
          + New deal
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Open deals" value={String(deals.filter((d) => d.status === "open").length)} />
        <StatCard label="Pipeline" value={formatMoney(pipeline)} />
        <StatCard label="Avg deal health" value={`${avgHealth}%`} tone={avgHealth >= 70 ? "emerald" : avgHealth >= 45 ? "amber" : "red"} />
        <StatCard label="High-priority actions" value={String(highPriority)} tone={highPriority > 0 ? "amber" : "slate"} />
      </div>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-tight text-slate-900">Your deals</h2>
          <span className="text-[11px] text-slate-400">{deals.length} total</span>
        </div>

        {deals.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center">
            <p className="text-slate-600">No deals yet.</p>
            <p className="mt-1 text-sm text-slate-400">
              Create a deal, paste a sales call transcript, and get your next best action.
            </p>
            <Link
              href="/nav/deals/new"
              className="mt-5 inline-block rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
            >
              Create your first deal
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {deals.map((d) => (
              <DealCard key={d.id} deal={d} nextAction={d.nextAction} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: string;
  tone?: "slate" | "emerald" | "amber" | "red";
}) {
  const color =
    tone === "emerald"
      ? "text-emerald-600"
      : tone === "amber"
        ? "text-amber-600"
        : tone === "red"
          ? "text-red-600"
          : "text-slate-900";
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className={`text-3xl font-semibold tracking-tight ${color}`}>{value}</div>
      <div className="mt-1 text-[13px] text-slate-500">{label}</div>
    </div>
  );
}