"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ProofBadge,
  ScoreRing,
  StatusBadge,
  fmtDate,
} from "@/components/ui";
import { ReportFindings } from "@/components/report-findings";
import { ReportPreview } from "@/components/report-preview";
import { createClient } from "@/lib/supabase/client";
import type {
  Asset,
  AssetStatus,
  AssetVersion,
  Approval,
  Comment,
  Proof,
  ProofIssue,
} from "@/types";

export interface ViewerData {
  asset: Asset;
  versions: (AssetVersion & { proof: (Proof & { issues: ProofIssue[] }) | null })[];
  approvals: Approval[];
  comments: Comment[];
  brand: {
    id: string;
    company_name: string | null;
    colors: { name: string; hex: string }[];
    fonts: string[];
    tone_of_voice: string | null;
    logo_url: string | null;
  } | null;
}

const NEXT_STATUSES: { status: AssetStatus; label: string; tone: string }[] = [
  { status: "approved", label: "Approve", tone: "bg-emerald-500 hover:bg-emerald-400" },
  { status: "changes_requested", label: "Request changes", tone: "bg-red-500 hover:bg-red-400" },
  { status: "published", label: "Mark published", tone: "bg-indigo-500 hover:bg-indigo-400" },
];

export function AssetViewer({ data }: { data: ViewerData }) {
  const router = useRouter();
  const { asset, versions, approvals, comments, brand } = data;

  const ordered = useMemo(() => [...versions].sort((a, b) => a.version - b.version), [versions]);
  const latestVersion = ordered[ordered.length - 1];

  const [selectedVersion, setSelectedVersion] = useState(ordered[ordered.length - 1]?.id);
  const [activeIssueId, setActiveIssueId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const [note, setNote] = useState<string | null>(null);

  const current = ordered.find((v) => v.id === selectedVersion) ?? ordered[ordered.length - 1];
  const proof = current?.proof;
  const issues = proof?.issues ?? [];

  const sortedIssues = useMemo(
    () =>
      [...issues].sort(
        (a, b) =>
          (a.severity === "high" ? 0 : a.severity === "medium" ? 1 : 2) -
          (b.severity === "high" ? 0 : b.severity === "medium" ? 1 : 2),
      ),
    [issues],
  );

  const activeIndex =
    activeIssueId != null ? issues.findIndex((issue) => issue.id === activeIssueId) : null;
  const resolvedActiveIndex = activeIndex != null && activeIndex >= 0 ? activeIndex : null;
  const shareUrl = `${location.origin}/reports/${asset.id}?v=${current?.version}`;

  async function setStatus(status: AssetStatus, comment?: string) {
    setBusy(status);
    setNote(null);
    const res = await fetch(`/api/assets/${asset.id}/approval`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, comment }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setNote(`Failed: ${d.error ?? "unknown error"}`);
    } else {
      setNote(`Status updated to ${status.replace("_", " ")}`);
    }
    setBusy(null);
    router.refresh();
  }

  async function reproof() {
    if (!current) return;
    setBusy("reproof");
    setNote(null);
    const res = await fetch(`/api/proof/${current.id}`, { method: "POST" });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setNote(`Re-proof failed: ${d.error ?? "unknown error"}`);
    } else {
      setNote("Proof complete.");
    }
    setBusy(null);
    router.refresh();
  }

  async function addComment() {
    const body = commentText.trim();
    if (!body) return;
    const supabase = createClient();
    await supabase.from("comments").insert({ asset_id: asset.id, body });
    setCommentText("");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4 pb-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.15em] text-[#6c6c6c]">
            Workspace report
          </p>
          <div className="flex items-center gap-2">
            <h1 className="text-[clamp(22px,3vw,30px)] font-bold leading-tight tracking-[-0.6px]">
              {asset.name}
            </h1>
            <StatusBadge status={asset.status} />
          </div>
          <p className="mt-1.5 text-[11px] text-[#6c6c6c]">
            {asset.kind === "pdf" ? "PDF" : "Image"} · Created {fmtDate(asset.created_at)} · v{asset.current_version}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {brand && (
            <Link
              href="/brand"
              className="rounded-[7px] border border-[#2a2a2a] px-3 py-2 text-[11px] text-[#bdbdbd] transition hover:border-[#444] hover:text-white"
            >
              Brand: {brand.company_name ?? "profile"}
            </Link>
          )}
          <button
            onClick={reproof}
            disabled={busy !== null}
            className="rounded-[7px] border border-[#2a2a2a] px-3 py-2 text-[11px] font-medium text-[#bdbdbd] transition hover:border-[#444] hover:text-white disabled:opacity-50"
          >
            {busy === "reproof" ? "Proofing…" : "Re-proof"}
          </button>
          <button
            onClick={() => navigator.clipboard.writeText(shareUrl)}
            className="rounded-[7px] bg-[#fbfbfb] px-3 py-2 text-[11px] font-bold text-black transition hover:bg-[#e8e8e8]"
          >
            Copy share link
          </button>
        </div>
      </div>

      {note && (
        <div className="rounded-[8px] border border-[#2a2a2a] bg-[#060606] px-4 py-2.5 text-[12px] text-[#bdbdbd]">
          {note}
        </div>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <div className="space-y-4">
          <div className="rounded-[10px] border border-[#111111] bg-[#060606] p-4">
            {proof ? (
              <div className="flex items-center gap-4">
                <ScoreRing score={proof.score} />
                <div className="min-w-0">
                  <ProofBadge status={proof.status} />
                  <p className="mt-2 text-[13px] leading-relaxed text-[#bdbdbd]">
                    {proof.summary ?? "No summary."}
                  </p>
                  <p className="mt-2 text-[10px] text-[#555]">
                    {proof.model ?? "AI"} · {fmtDate(proof.created_at)}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-[12px] text-[#6c6c6c]">
                No proof yet for v{current?.version}. Click “Re-proof” to run the AI review.
              </p>
            )}
          </div>

          <ReportFindings
            issues={sortedIssues}
            activeIndex={resolvedActiveIndex}
            onSelectIssue={(index) =>
              setActiveIssueId(index == null ? null : issues[index]?.id ?? null)
            }
          />

          <div className="flex flex-wrap gap-2">
            {NEXT_STATUSES.map(({ status, label, tone }) => (
              <button
                key={status}
                onClick={() => setStatus(status)}
                disabled={busy !== null}
                className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold text-white disabled:opacity-50 ${tone}`}
              >
                {busy === status ? "Saving…" : label}
              </button>
            ))}
          </div>

          <div className="rounded-[10px] border border-[#111111] bg-[#060606] p-4">
            <h3 className="mb-2 text-[12px] font-bold">Approval history</h3>
            {approvals.length === 0 ? (
              <p className="text-[12px] text-[#6c6c6c]">No approvals yet.</p>
            ) : (
              <ul className="space-y-2">
                {approvals.slice(0, 6).map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 text-[11px]">
                    <span>
                      <StatusBadge status={a.status} />{" "}
                      <span className="ml-1 text-[#6c6c6c]">v{a.version}</span>
                    </span>
                    <span className="text-[10px] text-[#555]">{fmtDate(a.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="space-y-4 lg:sticky lg:top-6">
          <div className="flex flex-wrap gap-1 text-[10px]">
            {ordered.map((v) => (
              <button
                key={v.id}
                onClick={() => {
                  setSelectedVersion(v.id);
                  setActiveIssueId(null);
                }}
                className={`rounded px-2 py-1 ${
                  v.id === current?.id
                    ? "bg-[#292929] font-medium text-white"
                    : "text-[#6c6c6c] hover:bg-[#0d0d0d] hover:text-[#bdbdbd]"
                }`}
              >
                v{v.version}
                {v.proof && (v.proof.score >= 90 ? " ✓" : v.proof.score >= 70 ? " ⚠" : " ✗")}
              </button>
            ))}
          </div>

          {current?.url ? (
            <ReportPreview
              title={asset.name}
              kind={asset.kind}
              url={current.url}
              previewMeta={current.preview_meta}
              issues={issues}
              activeIndex={resolvedActiveIndex}
              onSelectIssue={(index) =>
                setActiveIssueId(index == null ? null : issues[index]?.id ?? null)
              }
            />
          ) : (
            <div className="rounded-[12px] border border-[#111111] bg-[#060606] px-4 py-20 text-center text-[12px] text-[#6c6c6c]">
              No file for this version.
            </div>
          )}

          <div className="rounded-[10px] border border-[#111111] bg-[#060606] p-4">
            <h3 className="mb-3 text-[12px] font-bold">
              Comments <span className="font-normal text-[#6c6c6c]">({comments.length})</span>
            </h3>
            <div className="space-y-2">
              {comments.length === 0 && (
                <p className="text-[12px] text-[#6c6c6c]">No comments yet.</p>
              )}
              {comments.map((c) => (
                <div key={c.id} className="rounded-[7px] border border-[#202020] bg-[#080808] px-3 py-2.5 text-[12px]">
                  <p className="text-[#d0d0d0]">{c.body}</p>
                  <p className="mt-1 text-[10px] text-[#555]">{fmtDate(c.created_at)}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <input
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addComment()}
                placeholder="Add a comment…"
                className="min-w-0 flex-1 rounded-[7px] border border-[#2a2a2a] bg-[#0b0b0b] px-3 py-2 text-[12px] text-[#d0d0d0] outline-none focus:border-[#444]"
              />
              <button
                onClick={addComment}
                className="rounded-[7px] bg-[#292929] px-3 py-2 text-[11px] font-bold text-white hover:bg-[#363636]"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
