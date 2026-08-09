export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import { ScoreRing, ProofBadge, SeverityBadge, CategoryBadge, StatusBadge, fmtDate } from "@/components/ui";
import type { ProofIssue } from "@/types";

const MARKER_COLORS = ["#f43f5e", "#f59e0b", "#3b82f6", "#10b981", "#a855f7", "#ec4899", "#f97316", "#06b6d4"];

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = await createAdminClient();

  // Resolve by short slug first, then by UUID — id.eq on the uuid column can't
  // take a slug string, so the two lookups stay separate.
  const select = "id, name, kind, status, current_version, slug";
  const bySlug = await admin.from("assets").select(select).eq("slug", id).maybeSingle();
  const asset = bySlug.data ?? (await admin.from("assets").select(select).eq("id", id).maybeSingle()).data;
  if (!asset) notFound();

  const { data: version } = await admin
    .from("asset_versions")
    .select("id, version, url, created_at")
    .eq("asset_id", asset.id)
    .order("version", { ascending: false })
    .limit(1)
    .single();

  const { data: proof } = await admin
    .from("proofs")
    .select("id, score, status, summary, model, created_at")
    .eq("asset_version_id", version?.id ?? "")
    .maybeSingle();

  const { data: issues } = proof
    ? await admin.from("proof_issues").select("*").eq("proof_id", proof.id).order("severity", { ascending: false })
    : { data: [] };

  const sortedIssues = sortIssues((issues ?? []) as ProofIssue[]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-md bg-indigo-500 text-sm font-bold text-white">A</span>
          <span className="font-semibold">AI Proof report</span>
        </div>
        {asset.status && <StatusBadge status={asset.status} />}
      </header>

      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold">{asset.name}</h1>
            <p className="mt-1 text-sm text-slate-400">
              {proof ? `v${version?.version} · ${proof.model} · ${fmtDate(proof.created_at)}` : `v${version?.version ?? asset.current_version}`}
            </p>
          </div>
          {proof ? (
            <div className="flex items-center gap-3">
              <ProofBadge status={proof.status} />
              <ScoreRing score={proof.score} size={72} />
            </div>
          ) : null}
        </div>
        {proof?.summary ? <p className="mt-4 text-sm text-slate-300">{proof.summary}</p> : null}
      </div>

      {version?.url ? (
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50">
          <div className="border-b border-slate-800 px-4 py-2 text-sm font-medium">
            Annotated preview <span className="text-xs text-slate-500">({sortedIssues.length} issue{sortedIssues.length === 1 ? "" : "s"})</span>
          </div>
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={version.url} alt={asset.name} className="block w-full" />
            {sortedIssues.map((issue, i) => (
              <span
                key={issue.id}
                className="absolute grid size-[22px] place-items-center rounded-full text-[11px] font-bold text-white shadow-lg"
                style={{
                  left: `${(issue.x ?? 0.05) * 100}%`,
                  top: `${(issue.y ?? 0.05) * 100}%`,
                  background: MARKER_COLORS[i % MARKER_COLORS.length],
                }}
              >
                {i + 1}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {sortedIssues.length > 0 ? (
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50">
          <div className="border-b border-slate-800 px-4 py-2.5 text-sm font-semibold">Issues</div>
          <ul className="divide-y divide-slate-800/70">
            {sortedIssues.map((issue, i) => (
              <li key={issue.id} className="flex items-start gap-3 px-4 py-3">
                <span
                  className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white"
                  style={{ background: MARKER_COLORS[i % MARKER_COLORS.length] }}
                >
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{issue.title}</span>
                    <SeverityBadge severity={issue.severity} />
                    <CategoryBadge category={issue.category} />
                  </div>
                  {issue.description && <p className="mt-0.5 text-xs text-slate-400">{issue.description}</p>}
                  {issue.suggestion && <p className="mt-1 text-xs text-emerald-400/90">→ {issue.suggestion}</p>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-4 text-sm text-emerald-400">✅ No issues found.</p>
      )}

      <p className="mt-6 text-center text-xs text-slate-600">
        Generated by AI Proof · Reviews should be confirmed by a human before publishing.
      </p>
    </main>
  );
}

function sortIssues(issues: ProofIssue[]) {
  const rank = { high: 0, medium: 1, low: 2 } as const;
  return [...issues].sort((a, b) => rank[a.severity] - rank[b.severity]);
}
