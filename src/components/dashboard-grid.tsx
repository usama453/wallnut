"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { GroupCard, ReportRow } from "@/lib/groups-presentation";
import { PLATFORM_LABEL, platformColor, timeAgo } from "@/lib/groups-presentation";
import type { GroupPlatform } from "@/types";

type PlatformFilter = "all" | GroupPlatform;

const PLATFORMS: PlatformFilter[] = ["all", "whatsapp", "slack", "teams"];

export function DashboardGrid({
  orgName,
  cards,
  stats,
}: {
  orgName: string;
  cards: GroupCard[];
  stats: { groups: number; reports: number; filesChecked: number; issues: number };
}) {
  const [q, setQ] = useState("");
  const [platform, setPlatform] = useState<PlatformFilter>("all");
  const [status, setStatus] = useState<string>("all");

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return cards.filter((card) => {
      if (platform !== "all" && card.group.platform !== platform) return false;
      if (!query) return true;
      return (
        card.group.name.toLowerCase().includes(query) ||
        card.reports.some((r) => r.name.toLowerCase().includes(query))
      );
    });
  }, [cards, q, platform]);

  const totalReports = useMemo(() => {
    if (status === "all") return stats.reports;
    return cards.reduce(
      (n, c) => n + c.reports.filter((r) => r.status === status).length,
      0,
    );
  }, [cards, status, stats.reports]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-xl font-medium tracking-tight text-zinc-100">
          {orgName}
        </h1>
        <p className="text-sm text-zinc-500">
          Proofreading across your WhatsApp, Slack and Teams spaces.
        </p>
      </div>

      {/* Org stats */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-zinc-800 bg-zinc-800 sm:grid-cols-4">
        <Stat label="Groups" value={stats.groups} />
        <Stat label="Reports" value={totalReports} />
        <Stat label="Files checked" value={stats.filesChecked} />
        <Stat label="Issues found" value={stats.issues} />
      </div>

      {/* Search + filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1 sm:max-w-xs">
          <svg className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" strokeLinecap="round" />
          </svg>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search groups or reports…"
            className="w-full rounded-md border border-zinc-800 bg-zinc-950 py-2 pl-9 pr-3 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition focus:border-zinc-600"
          />
        </div>

        <div className="flex rounded-md border border-zinc-800 bg-zinc-950 p-0.5">
          {PLATFORMS.map((p) => (
            <button
              key={p}
              onClick={() => setPlatform(p)}
              className={`rounded px-3 py-1.5 text-xs font-medium transition ${
                platform === p
                  ? "bg-zinc-800 text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {p === "all" ? "All" : PLATFORM_LABEL[p]}
            </button>
          ))}
        </div>

        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-300 outline-none focus:border-zinc-600"
        >
          <option value="all">All statuses</option>
          <option value="approved">Approved</option>
          <option value="in_review">In review</option>
          <option value="changes_requested">Changes requested</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
        </select>
      </div>

      {/* Group cards */}
      {filtered.length === 0 ? (
        <EmptyState query={q.trim()} hasGroups={cards.length > 0} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((card) => (
            <GroupCardView key={card.group.id} card={card} />
          ))}
        </div>
      )}
    </div>
  );
}

function GroupCardView({ card }: { card: GroupCard }) {
  const { group, reports } = card;
  const color = platformColor(group.platform);
  const latest3 = reports.slice(0, 3);
  const more = reports.length - latest3.length;

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 transition hover:border-zinc-700">
      {/* Group header */}
      <div className="flex items-center justify-between gap-3 border-b border-zinc-800/80 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className="grid size-7 shrink-0 place-items-center rounded-md text-[10px] font-bold text-black"
            style={{ background: color }}
          >
            {group.platform === "whatsapp" ? "WA" : group.platform === "slack" ? "SL" : "MS"}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-zinc-100">{group.name}</p>
            <p className="text-[11px] text-zinc-500">
              {PLATFORM_LABEL[group.platform]} · {reports.length} report{reports.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>
        <Link
          href={`/groups/${group.id}`}
          className="shrink-0 text-[11px] font-medium text-zinc-400 hover:text-zinc-100"
        >
          Reports overview →
        </Link>
      </div>

      {/* Latest reports */}
      <div className="flex-1 divide-y divide-zinc-800/60">
        {latest3.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-zinc-600">
            No reports yet.
          </div>
        ) : (
          latest3.map((r) => <ReportRowView key={r.assetId} r={r} />)
        )}
        {more > 0 ? (
          <Link
            href={`/groups/${group.id}`}
            className="block px-4 py-2.5 text-center text-xs font-medium text-zinc-500 hover:text-zinc-100"
          >
            +{more} more report{more === 1 ? "" : "s"}
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function ReportRowView({ r }: { r: ReportRow }) {
  const href = r.slug ? `/reports/${r.slug}` : `/reports/${r.assetId}`;
  return (
    <Link href={href} className="flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-900/60">
      <div className="grid size-9 shrink-0 place-items-center overflow-hidden rounded border border-zinc-800 bg-zinc-900">
        {r.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={r.thumbnail} alt="" className="size-full object-cover" />
        ) : (
          <span className="text-[8px] text-zinc-600">{r.kind === "pdf" ? "PDF" : "IMG"}</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-zinc-200">{r.name}</p>
        <p className="text-[11px] text-zinc-500">{timeAgo(r.createdAt)}</p>
      </div>
      <IssueCount score={r.score} count={r.issueCount} />
    </Link>
  );
}

function IssueCount({ score, count }: { score: number | null; count: number }) {
  const tone =
    score == null
      ? "text-zinc-600"
      : score >= 90
        ? "text-emerald-400"
        : score >= 70
          ? "text-amber-400"
          : "text-red-400";
  return (
    <span className={`shrink-0 text-[11px] font-medium ${tone}`}>
      {count} {count === 1 ? "issue" : "issues"}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-zinc-950 px-4 py-4">
      <div className="text-2xl font-semibold tracking-tight text-zinc-100">{value}</div>
      <div className="mt-0.5 text-xs text-zinc-500">{label}</div>
    </div>
  );
}

function EmptyState({ query, hasGroups }: { query: string; hasGroups: boolean }) {
  return (
    <div className="rounded-lg border border-dashed border-zinc-800 px-6 py-16 text-center">
      {hasGroups ? (
        <>
          <p className="text-sm text-zinc-300">No groups match “{query}”.</p>
          <p className="mt-1 text-xs text-zinc-600">Try a different search or platform filter.</p>
        </>
      ) : (
        <>
          <p className="text-sm text-zinc-300">No teams yet.</p>
          <p className="mt-1 text-xs text-zinc-600">
            Connect WhatsApp or share a report to start proofing.
          </p>
        </>
      )}
    </div>
  );
}
