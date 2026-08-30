import { CategoryBadge, SeverityBadge } from "@/components/ui";
import { getCorrectionLines, type SummaryIssue } from "@/lib/reportSummary";
import type { ProofIssue } from "@/types";

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

export function ReportFindings({
  issues,
  activeIndex = null,
  onSelectIssue,
}: {
  issues: ProofIssue[];
  activeIndex?: number | null;
  onSelectIssue?: (index: number | null) => void;
}) {
  const corrections = getCorrectionLines(issues as SummaryIssue[]);
  const typoIds = new Set(
    issues.filter((issue) => /^Misspelled "/i.test(issue.title)).map((issue) => issue.id),
  );
  const otherIssues = issues.filter((issue) => !typoIds.has(issue.id));

  if (!issues.length) {
    return (
      <div className="rounded-[12px] border border-emerald-950 bg-emerald-950/20 px-5 py-8 text-center">
        <p className="text-[28px]">🟢</p>
        <p className="mt-2 text-[18px] font-bold text-emerald-200">All good</p>
        <p className="mt-1 text-[13px] text-emerald-300/80">No issues found in this report.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {corrections.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#6c6c6c]">
            Corrections
          </h2>
          {corrections.map((correction, index) => (
            <article
              key={`${correction.label}-${correction.before}-${index}`}
              className="rounded-[12px] border border-[#2a1515] bg-[#160d0d] px-5 py-5"
            >
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#e8a0a0]">
                {correction.label}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
                <span className="text-[clamp(28px,5vw,36px)] font-bold leading-none tracking-[-0.04em] text-[#ffb4b4] line-through decoration-[#ff6b6b]/80">
                  {correction.before}
                </span>
                <span className="text-[22px] text-[#555]" aria-hidden>
                  →
                </span>
                <span className="text-[clamp(28px,5vw,36px)] font-bold leading-none tracking-[-0.04em] text-[#7dffb2]">
                  {correction.after}
                </span>
              </div>
            </article>
          ))}
        </section>
      ) : null}

      {otherIssues.length > 0 ? (
        <section className="overflow-hidden rounded-[12px] border border-[#111111] bg-[#060606]">
          <div className="border-b border-[#131313] px-4 py-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[#6c6c6c]">
            Other findings
          </div>
          <ul className="divide-y divide-[#222]">
            {otherIssues.map((issue) => {
              const markerIndex = issues.indexOf(issue);
              const interactive = typeof onSelectIssue === "function";
              const active = activeIndex === markerIndex;

              return (
                <li key={issue.id}>
                  {interactive ? (
                    <button
                      type="button"
                      onClick={() =>
                        onSelectIssue(active ? null : markerIndex)
                      }
                      className={`flex w-full items-start gap-3 px-4 py-4 text-left transition hover:bg-[#080808] ${
                        active ? "bg-[#0a0a0a]" : ""
                      }`}
                    >
                      <IssueRowContent issue={issue} markerIndex={markerIndex} />
                    </button>
                  ) : (
                    <div className="flex items-start gap-3 px-4 py-4">
                      <IssueRowContent issue={issue} markerIndex={markerIndex} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function IssueRowContent({
  issue,
  markerIndex,
}: {
  issue: ProofIssue;
  markerIndex: number;
}) {
  return (
    <>
      <span
        className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white"
        style={{ background: MARKER_COLORS[markerIndex % MARKER_COLORS.length] }}
      >
        {markerIndex + 1}
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[14px] font-semibold text-[#f0f0f0]">{issue.title}</span>
          <SeverityBadge severity={issue.severity} />
          <CategoryBadge category={issue.category} />
        </div>
        {issue.description ? (
          <p className="mt-1.5 text-[13px] leading-relaxed text-[#919191]">{issue.description}</p>
        ) : null}
        {issue.suggestion ? (
          <p className="mt-2 text-[13px] font-medium text-emerald-300/90">
            {issue.suggestion}
          </p>
        ) : null}
      </div>
    </>
  );
}
