import Link from "next/link";
import { listActivity } from "@/lib/sales/queries";
import { formatDateTime } from "@/lib/sales/format";

export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  const activities = await listActivity(50);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Activity</h1>
        <p className="mt-1 text-sm text-slate-500">Deal memory across everything you analyze.</p>
      </div>

      {activities.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center">
          <p className="text-slate-600">No activity yet.</p>
          <p className="mt-1 text-sm text-slate-400">
            Analyze a transcript and every change gets recorded here.
          </p>
          <Link
            href="/nav"
            className="mt-5 inline-block rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            Go to dashboard
          </Link>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white">
          <ul className="divide-y divide-slate-100">
            {activities.map((a) => (
              <li key={a.id} className="flex items-start gap-4 px-5 py-3.5">
                <div className="mt-1.5 size-2 shrink-0 rounded-full bg-indigo-400" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    {a.deals?.company_name ? (
                      <Link
                        href={`/nav/deals/${a.deal_id}`}
                        className="text-[13px] font-semibold text-slate-900 hover:text-indigo-600"
                      >
                        {a.deals.company_name}
                      </Link>
                    ) : (
                      <span className="text-[13px] font-semibold text-slate-900">Deal</span>
                    )}
                    <span className="text-[13px] text-slate-600">{a.title}</span>
                  </div>
                  {a.detail && <p className="mt-0.5 text-[13px] leading-snug text-slate-500">{a.detail}</p>}
                </div>
                <span className="shrink-0 text-[11px] text-slate-400">{formatDateTime(a.created_at)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}