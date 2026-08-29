export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import { ScoreRing, ProofBadge, SeverityBadge, CategoryBadge, StatusBadge, fmtDate } from "@/components/ui";
import { AppHeader } from "@/components/wallnut/app-header";
import { MetricChip } from "@/components/wallnut/metric-chip";
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
    .select("id, version, url, preview_url, preview_meta, created_at")
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
    <div className="min-h-screen bg-black text-[#fbfbfb]">
      <AppHeader />
      <main className="mx-auto max-w-4xl px-4 pb-12 pt-6 sm:px-6">
        <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#6c6c6c]">
              Public report
            </p>
            <h1 className="mt-2 text-[clamp(24px,4vw,32px)] font-bold leading-tight tracking-[-0.72px]">
              {asset.name}
            </h1>
            <p className="mt-2 text-[12px] text-[#919191]">
              {proof
                ? `Version ${version?.version} · ${proof.model} · ${fmtDate(proof.created_at)}`
                : `Version ${version?.version ?? asset.current_version}`}
            </p>
          </div>
          {asset.status ? <StatusBadge status={asset.status} /> : null}
        </header>

        <section className="rounded-[10px] border border-[#1b1b1b] bg-[#101010] p-5 shadow-[0_16px_30px_rgba(0,0,0,0.35)]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap gap-2">
              <MetricChip value={`v${version?.version ?? asset.current_version}`} label="version" />
              <MetricChip value={sortedIssues.length} label="issues" />
            </div>
          {proof ? (
            <div className="flex items-center gap-3">
              <ProofBadge status={proof.status} />
              <ScoreRing score={proof.score} size={72} />
            </div>
          ) : null}
          </div>
          {proof?.summary ? (
            <p className="mt-4 max-w-2xl text-[13px] leading-relaxed text-[#bdbdbd]">
              {proof.summary}
            </p>
          ) : null}
        </section>

      {version?.url ? (
        <section className="mt-4 overflow-hidden rounded-[10px] border border-[#1b1b1b] bg-[#101010]">
          <div className="border-b border-[#222] px-4 py-3 text-[12px] font-bold">
            Annotated preview{" "}
            <span className="font-normal text-[#6c6c6c]">
              ({sortedIssues.length} issue{sortedIssues.length === 1 ? "" : "s"})
            </span>
          </div>
          <div className="relative bg-[#080808]">
            {version.preview_meta?.pages?.length ? (
              <div className="space-y-1">
                {(version.preview_meta.pages as Array<{ url: string; width: number; height: number }>).map((p, i) => {
                  const isPage1 = i === 0;
                  const boxStyle = p.width && p.height ? { aspectRatio: `${p.width}/${p.height}` } : undefined;
                  return (
                    <div key={p.url ?? i} className="relative mx-auto max-w-full" style={boxStyle}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.url} alt={`page ${i + 1}`} className="absolute inset-0 block h-full w-full object-contain" />
                      {isPage1 &&
                        sortedIssues.map((issue, i2) => (
                          <span
                            key={issue.id}
                            className="absolute grid size-[22px] place-items-center rounded-full text-[11px] font-bold text-white shadow-lg"
                            style={{
                              left: `${(issue.x ?? 0.05) * 100}%`,
                              top: `${(issue.y ?? 0.05) * 100}%`,
                              background: MARKER_COLORS[i2 % MARKER_COLORS.length],
                            }}
                          >
                            {i2 + 1}
                          </span>
                        ))}
                    </div>
                  );
                })}
              </div>
            ) : asset.kind === "pdf" ? (
              <iframe src={`${version.url}#toolbar=0`} title={asset.name} className="block h-[600px] w-full" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={version.url} alt={asset.name} className="block w-full" />
            )}
          </div>
        </section>
      ) : null}

      {sortedIssues.length > 0 ? (
        <section className="mt-4 overflow-hidden rounded-[10px] border border-[#1b1b1b] bg-[#101010]">
          <div className="border-b border-[#222] px-4 py-3 text-[12px] font-bold">Issues</div>
          <ul className="divide-y divide-[#222]">
            {sortedIssues.map((issue, i) => (
              <li key={issue.id} className="flex items-start gap-3 px-4 py-4">
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
                  {issue.description && (
                    <p className="mt-1 text-[12px] leading-relaxed text-[#919191]">
                      {issue.description}
                    </p>
                  )}
                  {issue.suggestion && (
                    <p className="mt-1.5 text-[12px] text-emerald-400/90">
                      Suggested: {issue.suggestion}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="mt-4 rounded-[10px] border border-emerald-950 bg-emerald-950/20 px-4 py-3 text-[12px] text-emerald-300">
          No issues found in this report.
        </p>
      )}

        <p className="mt-8 text-center text-[10px] text-[#555]">
          Generated by Wallnut · Reviews should be confirmed by a human before publishing.
        </p>
      </main>
    </div>
  );
}

function sortIssues(issues: ProofIssue[]) {
  const rank = { high: 0, medium: 1, low: 2 } as const;
  return [...issues].sort((a, b) => rank[a.severity] - rank[b.severity]);
}
