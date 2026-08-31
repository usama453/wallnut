export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import { fmtDate } from "@/components/ui";
import { AppHeader } from "@/components/wallnut/app-header";
import { ReportDashboardLink } from "@/components/report-dashboard-link";
import { ReportFindings } from "@/components/report-findings";
import { ReportPreview } from "@/components/report-preview";
import { ReportTranscription } from "@/components/report-transcription";
import { getProofTranscription } from "@/lib/proof/transcription";
import type { ProofIssue } from "@/types";

const PANEL_HEIGHT = "h-[280px] sm:h-[300px]";
const PREVIEW_HEIGHT_TWO_PANELS = "h-[572px] sm:h-[612px]";
const PREVIEW_HEIGHT_ONE_PANEL = PANEL_HEIGHT;

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = await createAdminClient();

  const select = "id, name, kind, status, current_version, slug, org_id";
  const bySlug = await admin.from("assets").select(select).eq("slug", id).maybeSingle();
  const asset = bySlug.data ?? (await admin.from("assets").select(select).eq("id", id).maybeSingle()).data;
  if (!asset) notFound();

  const { data: org } = asset.org_id
    ? await admin
        .from("organizations")
        .select("name, slug")
        .eq("id", asset.org_id)
        .maybeSingle()
    : { data: null };

  const { data: version } = await admin
    .from("asset_versions")
    .select("id, version, url, preview_url, preview_meta, created_at")
    .eq("asset_id", asset.id)
    .order("version", { ascending: false })
    .limit(1)
    .single();

  const { data: proof } = await admin
    .from("proofs")
    .select("id, score, status, summary, model, created_at, raw, ocr_text")
    .eq("asset_version_id", version?.id ?? "")
    .maybeSingle();

  const transcription = getProofTranscription(proof);

  const { data: issues } = proof
    ? await admin.from("proof_issues").select("*").eq("proof_id", proof.id).order("severity", { ascending: false })
    : { data: [] };

  const sortedIssues = sortIssues((issues ?? []) as ProofIssue[]);
  const reportedAt = proof?.created_at ?? version?.created_at ?? null;
  const previewHeight = transcription ? PREVIEW_HEIGHT_TWO_PANELS : PREVIEW_HEIGHT_ONE_PANEL;

  return (
    <div className="flex min-h-screen flex-col bg-black text-[#fbfbfb]">
      <AppHeader />
      <main className="mx-auto flex w-full max-w-[1080px] flex-1 flex-col px-4 pb-8 pt-5 sm:px-6">
        {org?.slug && org?.name ? (
          <div className="mb-5">
            <ReportDashboardLink orgName={org.name} orgSlug={org.slug} />
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-6">
          <div className="order-2 flex min-h-0 flex-col gap-3 lg:order-1">
            {sortedIssues.length > 0 ? (
              <ReportFindings
                issues={sortedIssues}
                reportedAt={reportedAt}
                className={PANEL_HEIGHT}
              />
            ) : (
              <article
                className={`flex min-h-0 flex-col overflow-hidden rounded-[8px] border border-[#111111] bg-[#060606] shadow-[0_24px_36px_rgba(0,0,0,0.48)] ${PANEL_HEIGHT}`}
              >
                <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[#111111] px-4 py-3">
                  <h2 className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#6c6c6c]">
                    Suggestions
                  </h2>
                  {reportedAt ? (
                    <p className="shrink-0 text-[11px] font-normal text-[#6c6c6c]">
                      {fmtDate(reportedAt)}
                    </p>
                  ) : null}
                </div>
                <p className="min-h-0 flex-1 overflow-y-auto px-4 py-3 text-[12px] leading-relaxed text-[#bdbdbd]">
                  No issues found.
                </p>
              </article>
            )}

            {transcription ? (
              <ReportTranscription text={transcription} className={PANEL_HEIGHT} />
            ) : null}
          </div>

          {version?.url ? (
            <div className={`order-1 min-h-0 lg:order-2 ${previewHeight}`}>
              <ReportPreview
                title={asset.name}
                kind={asset.kind as "image" | "pdf"}
                url={version.url}
                previewMeta={
                  version.preview_meta as {
                    pages: Array<{ url: string; width: number; height: number }>;
                  } | null
                }
                issues={sortedIssues}
                className="h-full"
              />
            </div>
          ) : null}
        </div>

        <div className="mt-auto pt-10">
          {proof?.summary ? (
            <p className="text-[12px] leading-relaxed text-[#919191]">{proof.summary}</p>
          ) : null}
          <p className={`text-center text-[10px] text-[#555] ${proof?.summary ? "mt-6" : ""}`}>
            Generated by Wallnut · Reviews should be confirmed by a human before publishing.
          </p>
        </div>
      </main>
    </div>
  );
}

function sortIssues(issues: ProofIssue[]) {
  const rank = { high: 0, medium: 1, low: 2 } as const;
  return [...issues].sort((a, b) => rank[a.severity] - rank[b.severity]);
}
