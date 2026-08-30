import Link from "next/link";
import { InitialAvatar } from "@/components/wallnut/avatar";
import { displayWhatsAppSender, reportAlertLabel, timeAgo, type ReportRow } from "@/lib/groups-presentation";

export function ReportCard({ report }: { report: ReportRow }) {
  const href = report.slug ? `/reports/${report.slug}` : `/reports/${report.assetId}`;
  const uploader = report.uploader?.includes("@")
    ? displayWhatsAppSender(report.uploader, undefined) ?? report.uploader ?? "Workspace"
    : report.uploader ?? "Workspace";
  const scoreTone =
    report.score == null
      ? "text-[#6c6c6c]"
      : report.score >= 90
        ? "text-emerald-300"
        : report.score >= 70
          ? "text-amber-300"
          : "text-red-300";
  const alertLabel = reportAlertLabel(report);

  return (
    <Link
      href={href}
      className="group flex h-full flex-col overflow-hidden rounded-[10px] border border-[#111111] bg-[#060606] shadow-[0_16px_24px_rgba(0,0,0,0.35)] transition duration-200 hover:-translate-y-0.5 hover:border-[#1a1a1a]"
    >
      <div className="relative aspect-video overflow-hidden bg-[#080808]">
        {report.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={report.thumbnail}
            alt=""
            className="size-full object-cover transition duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <ReportPlaceholder kind={report.kind} seed={report.name} />
        )}
        <span className="absolute right-2.5 top-2.5 rounded-[4px] bg-black/70 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-white/85">
          {report.kind}
        </span>
        {alertLabel ? (
          <span className="absolute left-2.5 top-2.5 rounded-[4px] bg-red-950/80 px-2 py-1 text-[9px] font-bold text-red-200">
            {alertLabel}
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-2.5 px-3.5 py-3">
        <div className="flex items-start justify-between gap-3">
          <h2 className="line-clamp-2 min-w-0 flex-1 text-[13px] font-bold leading-[1.35] text-[#fbfbfb]">
            {report.name}
          </h2>
          {report.score != null ? (
            <span className={`shrink-0 text-[11px] font-semibold tabular-nums ${scoreTone}`}>
              {report.score}/100
            </span>
          ) : null}
        </div>

        <div className="mt-auto flex items-center gap-3 border-t border-[#111111] pt-2.5 text-[10px]">
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <InitialAvatar label={uploader} size={18} />
            <span className="truncate text-[#bdbdbd]">{uploader}</span>
          </div>
          <span className="shrink-0 whitespace-nowrap text-[#919191]">
            <span className="font-bold text-[#fbfbfb]">{report.issueCount}</span> issue
            {report.issueCount === 1 ? "" : "s"}
          </span>
          <span className="shrink-0 whitespace-nowrap text-[#6c6c6c]">
            {timeAgo(report.createdAt)}
          </span>
        </div>
      </div>
    </Link>
  );
}

function ReportPlaceholder({ kind, seed }: { kind: "image" | "pdf"; seed: string }) {
  const colors = ["#302645", "#18362b", "#3a2818", "#172d43", "#3e1f34"];
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  const background = colors[Math.abs(hash) % colors.length]!;

  return (
    <div className="absolute inset-0 p-4" style={{ background }}>
      <div className="flex size-full flex-col gap-2 rounded-[7px] border border-white/10 bg-black/25 p-3">
        {kind === "pdf" ? (
          <>
            <span className="h-2 w-1/2 rounded-full bg-white/25" />
            <span className="h-1.5 w-11/12 rounded-full bg-white/10" />
            <span className="h-1.5 w-4/5 rounded-full bg-white/10" />
            <span className="mt-auto grid grid-cols-2 gap-2">
              <span className="h-10 rounded bg-white/10" />
              <span className="h-10 rounded bg-white/[0.07]" />
            </span>
          </>
        ) : (
          <>
            <span className="flex-1 rounded bg-white/10" />
            <span className="h-2 w-1/2 rounded-full bg-white/20" />
            <span className="h-1.5 w-1/3 rounded-full bg-white/10" />
          </>
        )}
      </div>
    </div>
  );
}
