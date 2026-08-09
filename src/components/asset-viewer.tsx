"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ProofBadge,
  ScoreRing,
  SeverityBadge,
  StatusBadge,
  CategoryBadge,
  fmtDate,
} from "@/components/ui";
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

const MARKER_COLORS = [
  "#f43f5e",
  "#f59e0b",
  "#3b82f6",
  "#10b981",
  "#a855f7",
  "#ec4899",
  "#f97316",
  "#06b6d4",
];

export function AssetViewer({ data }: { data: ViewerData }) {
  const router = useRouter();
  const { asset, versions, approvals, comments, brand } = data;

  const ordered = useMemo(() => [...versions].sort((a, b) => a.version - b.version), [versions]);
  const latestVersion = ordered[ordered.length - 1];
  const latestProof = latestVersion?.proof;

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

  const activeIssue = issues.find((i) => i.id === activeIssueId) ?? null;
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">{asset.name}</h1>
            <StatusBadge status={asset.status} />
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            {asset.kind === "pdf" ? "PDF" : "Image"} · Created {fmtDate(asset.created_at)} · v{asset.current_version}
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          {brand && (
            <Link
              href="/brand"
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-slate-500"
            >
              ◧ Brand: {brand.company_name ?? "profile"}
            </Link>
          )}
          <button
            onClick={reproof}
            disabled={busy !== null}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium hover:border-slate-500 disabled:opacity-50"
          >
            {busy === "reproof" ? "Proofing…" : "↻ Re-proof"}
          </button>
          <button
            onClick={() => navigator.clipboard.writeText(shareUrl)}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium hover:border-slate-500"
          >
            🔗 Copy share link
          </button>
        </div>
      </div>

      {note && (
        <div className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-300">
          {note}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* LEFT: artwork + annotations */}
        <div className="space-y-4">
          <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50">
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2">
              <span className="text-sm font-medium">
                Annotated preview{" "}
                <span className="text-xs text-slate-500">
                  ({issues.length} issue{issues.length === 1 ? "" : "s"})
                </span>
              </span>
              <div className="flex gap-1 text-xs">
                {ordered.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => {
                      setSelectedVersion(v.id);
                      setActiveIssueId(null);
                    }}
                    className={`rounded px-2 py-1 ${
                      v.id === current?.id
                        ? "bg-slate-700 font-medium"
                        : "text-slate-400 hover:bg-slate-800"
                    }`}
                  >
                    v{v.version}
                    {v.proof && (v.proof.score >= 90 ? " ✓" : v.proof.score >= 70 ? " ⚠" : " ✗")}
                  </button>
                ))}
              </div>
            </div>

            {current?.url ? (
              <div className="relative w-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={current.url} alt={asset.name} className="block w-full" />

                {sortedIssues.map((issue, i) => {
                  const markerIndex = issues.indexOf(issue);
                  const color = MARKER_COLORS[markerIndex % MARKER_COLORS.length];
                  const x = (issue.x ?? 0.05) * 100;
                  const y = (issue.y ?? 0.05) * 100;
                  const w = (issue.w ?? 0.15) * 100;
                  const h = (issue.h ?? 0.1) * 100;
                  const active = issue.id === activeIssueId;

                  return (
                    <button
                      key={issue.id}
                      onClick={() => setActiveIssueId(issue.id === activeIssueId ? null : issue.id)}
                      className="absolute"
                      style={{
                        left: `${x}%`,
                        top: `${y}%`,
                        zIndex: active ? 20 : 10,
                      }}
                      aria-label={issue.title}
                    >
                      <span
                        className="block rounded-full text-white shadow-lg"
                        style={{
                          background: color,
                          width: 22,
                          height: 22,
                          fontSize: 11,
                          fontWeight: 700,
                          display: "grid",
                          placeItems: "center",
                          transform: active ? "scale(1.25)" : "scale(1)",
                          transition: "transform .15s",
                          boxShadow: active ? `0 0 0 3px rgba(255,255,255,.5)` : undefined,
                        }}
                      >
                        {markerIndex + 1}
                      </span>
                      {active && (
                        <span className="pointer-events-none absolute left-0 top-6 z-30 mt-1 w-max max-w-56 rounded-md bg-slate-950/95 px-2 py-1 text-[11px] text-white shadow-xl">
                          {issue.title}
                        </span>
                      )}
                    </button>
                  );
                })}

                {activeIssue && activeIssue.x != null && activeIssue.y != null && (
                  <span
                    className="pointer-events-none absolute border-2 border-indigo-400"
                    style={{
                      left: `${activeIssue.x * 100}%`,
                      top: `${activeIssue.y * 100}%`,
                      width: `${(activeIssue.w ?? 0.15) * 100}%`,
                      height: `${(activeIssue.h ?? 0.1) * 100}%`,
                      zIndex: 15,
                    }}
                  />
                )}
              </div>
            ) : (
              <div className="px-4 py-20 text-center text-sm text-slate-500">No file for this version.</div>
            )}
          </div>

          {/* Comments */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <h3 className="mb-3 text-sm font-semibold">
              Comments <span className="text-slate-500">({comments.length})</span>
            </h3>
            <div className="space-y-2">
              {comments.length === 0 && (
                <p className="text-sm text-slate-500">No comments yet.</p>
              )}
              {comments.map((c) => (
                <div key={c.id} className="rounded-lg bg-slate-800/50 px-3 py-2 text-sm">
                  <p className="text-slate-200">{c.body}</p>
                  <p className="mt-1 text-[11px] text-slate-500">{fmtDate(c.created_at)}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <input
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addComment()}
                placeholder="Add a comment…"
                className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm outline-none focus:border-indigo-500"
              />
              <button
                onClick={addComment}
                className="rounded-lg bg-slate-700 px-3 py-1.5 text-sm font-medium hover:bg-slate-600"
              >
                Add
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT: score + issues + approval */}
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            {proof ? (
              <div className="flex items-center gap-4">
                <ScoreRing score={proof.score} />
                <div className="min-w-0">
                  <ProofBadge status={proof.status} />
                  <p className="mt-2 text-sm text-slate-300">{proof.summary ?? "No summary."}</p>
                  <p className="mt-2 text-[11px] text-slate-500">
                    {proof.model ?? "AI"} · {fmtDate(proof.created_at)}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                No proof yet for v{current?.version}. Click “Re-proof” to run the AI review.
              </p>
            )}
          </div>

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

          {/* Issue list */}
          <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50">
            <div className="border-b border-slate-800 px-4 py-2.5 text-sm font-semibold">
              Issues <span className="text-slate-500">({issues.length})</span>
            </div>
            {sortedIssues.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500">
                ✅ No issues found in this version.
              </p>
            ) : (
              <ul className="thin-scroll max-h-80 divide-y divide-slate-800/70 overflow-y-auto">
                {sortedIssues.map((issue) => {
                  const markerIndex = issues.indexOf(issue);
                  return (
                    <li key={issue.id}>
                      <button
                        onClick={() =>
                          setActiveIssueId(issue.id === activeIssueId ? null : issue.id)
                        }
                        className={`flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-800/30 ${
                          issue.id === activeIssueId ? "bg-slate-800/50" : ""
                        }`}
                      >
                        <span
                          className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white"
                          style={{ background: MARKER_COLORS[markerIndex % MARKER_COLORS.length] }}
                        >
                          {markerIndex + 1}
                        </span>
                        <span className="min-w-0">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{issue.title}</span>
                            <SeverityBadge severity={issue.severity} />
                            <CategoryBadge category={issue.category} />
                          </span>
                          {issue.description && (
                            <span className="mt-0.5 block text-xs text-slate-400">
                              {issue.description}
                            </span>
                          )}
                          {issue.suggestion && (
                            <span className="mt-1 block text-xs text-emerald-400/90">
                              → {issue.suggestion}
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Approval history */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <h3 className="mb-2 text-sm font-semibold">Approval history</h3>
            {approvals.length === 0 ? (
              <p className="text-sm text-slate-500">No approvals yet.</p>
            ) : (
              <ul className="space-y-2">
                {approvals.slice(0, 6).map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
                    <span>
                      <StatusBadge status={a.status} /> <span className="ml-1 text-xs text-slate-500">v{a.version}</span>
                    </span>
                    <span className="text-[11px] text-slate-500">{fmtDate(a.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
