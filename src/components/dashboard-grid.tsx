"use client";

import Link from "next/link";
import { useState } from "react";
import { InitialAvatar } from "@/components/wallnut/avatar";
import { PlatformIcon } from "@/components/wallnut/icons";
import { Reveal } from "@/components/wallnut/reveal";
import type { GroupCard, ReportRow } from "@/lib/groups-presentation";
import { timeAgo } from "@/lib/groups-presentation";
import { orgGroupPath, orgRankingsPath } from "@/lib/org-paths";
import type { PersonStats } from "@/lib/stats";

export function DashboardGrid({
  orgName,
  orgSlug,
  cards,
  stats,
  leaders,
}: {
  orgName: string;
  orgSlug: string;
  cards: GroupCard[];
  stats: {
    groups: number;
    reports: number;
    filesChecked: number;
    issues: number;
    members: number;
  };
  leaders: PersonStats[];
}) {
  return (
    <section className="flex flex-col items-center py-4 sm:py-8">
      <Reveal dramatic>
        <h1 className="text-center text-[clamp(25px,4vw,34px)] font-bold leading-none tracking-[-0.8px] text-white">
          {orgName}
        </h1>
      </Reveal>

      <Reveal dramatic delayMs={180}>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[12px] text-[#919191]">
          <span>{stats.members} members</span>
          <span>{stats.groups} groups</span>
          <span>{stats.reports} reports</span>
          <span>{stats.issues} issues found</span>
        </div>
      </Reveal>

      {leaders.length > 0 ? (
        <Reveal dramatic delayMs={400}>
          <Link
            href={orgRankingsPath(orgSlug)}
            className="mt-12 flex items-end justify-center gap-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-8"
            aria-label="Open team rankings"
          >
            {leaders.slice(0, 5).map((leader, index) => (
              <RankedAvatar
                key={leader.key}
                leader={leader}
                index={index}
                total={Math.min(leaders.length, 5)}
              />
            ))}
          </Link>
        </Reveal>
      ) : (
        <Reveal dramatic delayMs={400}>
          <Link
            href={orgRankingsPath(orgSlug)}
            className="mt-12 rounded-full border border-[#292929] px-3 py-1.5 text-[11px] text-[#919191] transition hover:border-[#3a3a3a] hover:text-white"
          >
            Rankings will appear after the first upload
          </Link>
        </Reveal>
      )}

      <div className="mt-8 flex w-full max-w-[680px] flex-col gap-3">
        {cards.length > 0 ? (
          cards.map((card, index) => (
            <Reveal key={card.group.id} dramatic delayMs={620 + index * 110}>
              <DashboardGroupCard
                card={card}
                orgSlug={orgSlug}
                defaultOpen={index === 0}
              />
            </Reveal>
          ))
        ) : (
          <div className="rounded-[8px] border border-dashed border-[#252525] px-6 py-14 text-center">
            <p className="text-[12px] font-bold text-[#bdbdbd]">No groups yet</p>
            <p className="mt-1 text-[11px] text-[#5f5f5f]">
              Linked WhatsApp groups will appear here.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function RankedAvatar({
  leader,
  index,
  total,
}: {
  leader: PersonStats;
  index: number;
  total: number;
}) {
  const center = (total - 1) / 2;
  const distance = Math.abs(index - center);
  const size = distance < 0.5 ? 45 : distance < 1.5 ? 36 : 31;
  return (
    <span className="group relative flex items-end">
      <InitialAvatar label={leader.display} size={size} />
      <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 whitespace-nowrap rounded-[8px] border border-[#2a2a2a] bg-[#161616] px-2.5 py-2 text-center opacity-0 shadow-[0_8px_24px_rgba(0,0,0,0.45)] transition group-hover:opacity-100 group-focus-within:opacity-100">
        <span className="block text-[11px] font-bold text-white">
          {index + 1}
          {ordinalSuffix(index + 1)} place
        </span>
        <span className="mt-0.5 block text-[10px] text-[#919191]">
          {leader.typos} issue{leader.typos === 1 ? "" : "s"}
        </span>
      </span>
    </span>
  );
}

function DashboardGroupCard({
  card,
  orgSlug,
  defaultOpen,
}: {
  card: GroupCard;
  orgSlug: string;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const preview = card.reports.slice(0, 5);

  return (
    <article className="overflow-hidden rounded-[8px] border border-[#1b1b1b] bg-[#101010] shadow-[0_24px_36px_rgba(0,0,0,0.48)]">
      <div className="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-[#161616]">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <PlatformIcon platform={card.group.platform} />
          <span className="truncate text-[12px] font-bold text-[#fbfbfb]">
            {card.group.name}
          </span>
          <span className="text-[10px] text-[#555]">
            {card.reports.length}
          </span>
        </button>
        <Link
          href={orgGroupPath(orgSlug, card.group.id)}
          className="shrink-0 text-[12px] text-[#919191] transition hover:text-white"
        >
          View more
        </Link>
      </div>

      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-out ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <div className="border-t border-[#222] px-4 py-3">
            {preview.length > 0 ? (
              <div className="flex flex-col gap-1">
                {preview.map((report) => (
                  <DashboardReportRow key={report.assetId} report={report} />
                ))}
              </div>
            ) : (
              <div className="py-7 text-center">
                <p className="text-[11px] text-[#6c6c6c]">No reports in this group yet.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function DashboardReportRow({ report }: { report: ReportRow }) {
  const href = report.slug ? `/reports/${report.slug}` : `/reports/${report.assetId}`;
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-[6px] px-1 py-2 transition hover:bg-[#171717]"
    >
      <ReportMarker report={report} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] text-[#bdbdbd]">{report.name}</span>
        <span className="mt-0.5 block truncate text-[10px] text-[#555]">
          {report.uploader ? `By ${report.uploader} · ` : ""}
          {report.issueCount} issue{report.issueCount === 1 ? "" : "s"}
        </span>
      </span>
      <span className="ml-3 shrink-0 text-[11px] text-[#6c6c6c]">
        {timeAgo(report.createdAt)}
      </span>
    </Link>
  );
}

function ReportMarker({ report }: { report: ReportRow }) {
  const color =
    report.score == null
      ? "#3a3a3a"
      : report.score >= 90
        ? "#22c55e"
        : report.score >= 70
          ? "#f59e0b"
          : "#ef4444";
  return (
    <span
      className="grid size-[22px] shrink-0 place-items-center overflow-hidden rounded-[4px] bg-[#252525]"
      style={!report.thumbnail ? { background: color } : undefined}
    >
      {report.thumbnail ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={report.thumbnail} alt="" className="size-full object-cover" />
      ) : (
        <span className="text-[7px] font-bold text-white/80">
          {report.kind === "pdf" ? "PDF" : "IMG"}
        </span>
      )}
    </span>
  );
}

function ordinalSuffix(value: number) {
  if (value % 100 >= 11 && value % 100 <= 13) return "th";
  if (value % 10 === 1) return "st";
  if (value % 10 === 2) return "nd";
  if (value % 10 === 3) return "rd";
  return "th";
}
