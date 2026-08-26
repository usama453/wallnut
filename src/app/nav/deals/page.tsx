import Link from "next/link";
import { listDeals } from "@/lib/sales/queries";
import { DealCard } from "@/components/navigator/deal-card";

export const dynamic = "force-dynamic";

export default async function DealsPage() {
  const deals = await listDeals();

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Deals</h1>
          <p className="mt-1 text-sm text-slate-500">Everything in your pipeline.</p>
        </div>
        <Link
          href="/nav/deals/new"
          className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500"
        >
          + New deal
        </Link>
      </div>

      {deals.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center">
          <p className="text-slate-600">No deals yet.</p>
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
    </div>
  );
}