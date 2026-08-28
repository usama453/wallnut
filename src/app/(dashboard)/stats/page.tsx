import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getStats } from "@/lib/stats";

export const dynamic = "force-dynamic";

export default async function StatsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const stats = await getStats();
  if (!stats) redirect("/login");

  const { byUploads, byTypos, totals } = stats;
  const maxUploads = Math.max(1, ...byUploads.map((p) => p.uploads));
  const maxTypos = Math.max(1, ...byTypos.map((p) => p.typos));

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-medium tracking-tight text-zinc-100">Stats</h1>
        <p className="text-sm text-zinc-500">
          Team activity across {totals.people} phone{totals.people === 1 ? "" : "s"} — who
          uploads the most, and who leaves the most typos.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
      {/* Uploads leaderboard */}
      <section className="overflow-hidden rounded-lg border border-zinc-800">
        <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-950 px-4 py-3">
          <div>
            <h2 className="text-sm font-medium text-zinc-100">Top uploaders</h2>
            <p className="text-[11px] text-zinc-500">Who sent the most designs for proofing</p>
          </div>
          <span className="rounded-full border border-zinc-800 px-2 py-0.5 text-[11px] text-zinc-400">{totals.uploads}</span>
        </div>
        <ul className="divide-y divide-zinc-800/60 bg-zinc-950">
          {byUploads.length === 0 ? (
            <li className="px-4 py-10 text-center text-xs text-zinc-600">No uploads yet.</li>
          ) : (
            byUploads.map((p, i) => (
              <li key={p.key} className="flex items-center gap-3 px-4 py-3">
                <Rank i={i} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium text-zinc-100">{p.display}</span>
                    <span className="shrink-0 text-xs text-zinc-400">
                      {p.uploads} upload{p.uploads === 1 ? "" : "s"}
                      {p.avgScore != null ? ` · ${p.avgScore}/100` : ""}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-900">
                    <div
                      className="h-full rounded-full bg-zinc-300"
                      style={{ width: `${(p.uploads / maxUploads) * 100}%` }}
                    />
                  </div>
                </div>
              </li>
            ))
          )}
        </ul>
      </section>

      {/* Typos leaderboard */}
      <section className="overflow-hidden rounded-lg border border-zinc-800">
        <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-950 px-4 py-3">
          <div>
            <h2 className="text-sm font-medium text-zinc-100">Top typo committers</h2>
            <p className="text-[11px] text-zinc-500">By issues found in the proofs they uploaded</p>
          </div>
          <span className="rounded-full border border-zinc-800 px-2 py-0.5 text-[11px] text-zinc-400">{totals.typos}</span>
        </div>
        <ul className="divide-y divide-zinc-800/60 bg-zinc-950">
          {byTypos.length === 0 ? (
            <li className="px-4 py-10 text-center text-xs text-zinc-600">No issues recorded yet.</li>
          ) : (
            byTypos.map((p, i) => (
              <li key={p.key} className="flex items-center gap-3 px-4 py-3">
                <Rank i={i} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium text-zinc-100">{p.display}</span>
                    <span
                      className={`shrink-0 text-xs font-medium ${
                        p.typos > 0 ? "text-red-400" : "text-zinc-600"
                      }`}
                    >
                      {p.typos} issue{p.typos === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-900">
                    <div
                      className={`h-full rounded-full ${p.typos > 0 ? "bg-red-400/80" : "bg-zinc-700"}`}
                      style={{ width: `${(p.typos / maxTypos) * 100}%` }}
                    />
                  </div>
                </div>
              </li>
            ))
          )}
        </ul>
      </section>
      </div>
    </div>
  );
}

function Rank({ i }: { i: number }) {
  const medal =
    i === 0 ? "bg-amber-400/90 text-black" : i === 1 ? "bg-zinc-400/80 text-black" : i === 2 ? "bg-orange-400/80 text-black" : "bg-zinc-800 text-zinc-400";
  return (
    <span className={`grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold ${medal}`}>
      {i + 1}
    </span>
  );
}
