"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PersonAvatar } from "@/components/wallnut/person-avatar";
import { PlatformIcon } from "@/components/wallnut/icons";
import { Reveal } from "@/components/wallnut/reveal";
import type { GroupCard, PendingWhatsAppInvite, ReportRow } from "@/lib/groups-presentation";
import { timeAgo } from "@/lib/groups-presentation";
import { orgGroupPath, orgRankingsPath } from "@/lib/org-paths";
import type { PersonStats } from "@/lib/stats";

export function DashboardGrid({
  orgName,
  orgSlug,
  cards,
  stats,
  leaders,
  pendingInvites = [],
  canAddGroup = false,
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
  pendingInvites?: PendingWhatsAppInvite[];
  canAddGroup?: boolean;
}) {
  const router = useRouter();
  const [createdInvites, setCreatedInvites] = useState<PendingWhatsAppInvite[]>([]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const invites = [
    ...createdInvites,
    ...pendingInvites.filter(
      (invite) => !createdInvites.some((created) => created.id === invite.id),
    ),
  ];

  async function addWhatsAppGroup() {
    if (!canAddGroup || creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const response = await fetch("/api/whatsapp/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", org: orgSlug }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Failed to create code");
      setCreatedInvites((current) => [
        {
          id: data.id ?? data.code,
          code: data.code,
          expiresAt: data.expiresAt ?? null,
          createdAt: new Date().toISOString(),
        },
        ...current,
      ]);
      router.refresh();
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Failed to create code");
    } finally {
      setCreating(false);
    }
  }

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
            className="relative z-10 mt-12 flex items-end justify-center gap-1 overflow-visible pt-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-8"
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
        {canAddGroup ? (
          <div className="flex flex-col items-stretch gap-2">
            <button
              type="button"
              onClick={() => void addWhatsAppGroup()}
              disabled={creating}
              className="flex items-center justify-center gap-2 rounded-[8px] border border-dashed border-[#2a2a2a] px-4 py-3 text-[12px] font-bold text-[#d0d0d0] transition hover:border-[#3a3a3a] hover:bg-[#121212] hover:text-white disabled:opacity-50"
            >
              <PlatformIcon platform="whatsapp" size={16} />
              {creating ? "Creating code…" : "Add WhatsApp group"}
            </button>
            {createError ? (
              <p role="alert" className="text-center text-[11px] text-[#e8b4b4]">
                {createError}
              </p>
            ) : null}
          </div>
        ) : null}

        {invites.map((invite, index) => (
          <Reveal key={invite.id} dramatic delayMs={520 + index * 80}>
            <PendingWhatsAppGroupCard invite={invite} defaultOpen />
          </Reveal>
        ))}

        {cards.length > 0 ? (
          cards.map((card, index) => (
            <Reveal key={card.group.id} dramatic delayMs={620 + (invites.length + index) * 110}>
              <DashboardGroupCard
                card={card}
                orgSlug={orgSlug}
                defaultOpen={invites.length === 0 && index === 0}
              />
            </Reveal>
          ))
        ) : invites.length === 0 ? (
          <div className="rounded-[8px] border border-dashed border-[#252525] px-6 py-14 text-center">
            <p className="text-[12px] font-bold text-[#bdbdbd]">No groups yet</p>
            <p className="mt-1 text-[11px] text-[#5f5f5f]">
              {canAddGroup
                ? "Add a WhatsApp group, then paste the code in that chat to sync it here."
                : "Linked WhatsApp groups will appear here."}
            </p>
          </div>
        ) : null}
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
      <PersonAvatar label={leader.display} src={leader.avatarUrl} size={size} />
      <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 whitespace-nowrap rounded-[8px] border border-[#2a2a2a] bg-[#161616] px-2.5 py-2 text-center opacity-0 shadow-[0_8px_24px_rgba(0,0,0,0.45)] transition group-hover:opacity-100 group-focus-within:opacity-100">
        <span className="block text-[11px] font-bold text-white">
          {leader.display}
        </span>
        <span className="mt-0.5 block text-[10px] text-[#919191]">
          {index + 1}
          {ordinalSuffix(index + 1)} place · {leader.typos} issue
          {leader.typos === 1 ? "" : "s"}
        </span>
      </span>
    </span>
  );
}

function PendingWhatsAppGroupCard({
  invite,
  defaultOpen,
}: {
  invite: PendingWhatsAppInvite;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(invite.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <article className="overflow-hidden rounded-[8px] border border-[#1b1b1b] bg-[#101010] shadow-[0_24px_36px_rgba(0,0,0,0.48)]">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <PlatformIcon platform="whatsapp" />
          <span className="truncate text-[12px] font-bold text-[#fbfbfb]">
            Waiting to sync
          </span>
          <span className="font-mono text-[10px] tracking-wider text-[#25D366]">
            {invite.code}
          </span>
        </button>
        <button
          type="button"
          onClick={() => void copyCode()}
          className="shrink-0 text-[12px] text-[#919191] transition hover:text-white"
        >
          {copied ? "Copied" : "Copy code"}
        </button>
      </div>

      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-out ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <div className="border-t border-[#222] px-4 py-6 text-center">
            <p className="font-mono text-[22px] font-bold tracking-[0.18em] text-white">
              {invite.code}
            </p>
            <p className="mt-3 text-[12px] leading-relaxed text-[#919191]">
              Enter this code in your WhatsApp group chat to enable sync
            </p>
          </div>
        </div>
      </div>
    </article>
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
