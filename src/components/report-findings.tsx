import { getCorrectionLines, type SummaryIssue } from "@/lib/reportSummary";
import { ScoreRing } from "@/components/ui";
import type { ProofIssue } from "@/types";

function issueSentence(issue: ProofIssue): string {
  return issue.description?.trim() || issue.title?.trim() || "Issue found";
}

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
  score = null,
  activeIndex = null,
  onSelectIssue,
}: {
  issues: ProofIssue[];
  score?: number | null;
  activeIndex?: number | null;
  onSelectIssue?: (index: number | null) => void;
}) {
  const corrections = getCorrectionLines(issues as SummaryIssue[]);
  const typoIds = new Set(
    issues.filter((issue) => /^Misspelled "/i.test(issue.title)).map((issue) => issue.id),
  );
  const otherIssues = issues.filter((issue) => !typoIds.has(issue.id));

  if (!issues.length) {
    return null;
  }

  return (
    <article className="overflow-hidden rounded-[8px] border border-[#111111] bg-[#060606] shadow-[0_24px_36px_rgba(0,0,0,0.48)]">
      {typeof score === "number" ? (
        <div className="flex items-center justify-end border-b border-[#111111] px-4 py-3">
          <ScoreRing score={score} size={44} />
        </div>
      ) : null}
      {corrections.length > 0 ? (
        <section>
          <div className="border-b border-[#111111] px-4 py-3">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#6c6c6c]">
              Corrections
            </h2>
          </div>
          <div className="flex flex-col gap-1 px-4 py-3">
            {corrections.map((correction, index) => (
              <div
                key={`${correction.label}-${correction.before}-${index}`}
                className="rounded-[6px] px-1 py-2"
              >
                <p className="text-[14px] font-medium leading-normal tracking-[-0.01em]">
                  <span className="text-[#ffc4c4] line-through decoration-[#ff6b6b]/80">
                    {correction.before}
                  </span>
                  <span className="mx-2.5 text-[13px] text-[#8a8a8a]" aria-hidden>
                    →
                  </span>
                  <span className="font-semibold text-[#8effb8]">{correction.after}</span>
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {otherIssues.length > 0 ? (
        <section className={corrections.length > 0 ? "border-t border-[#111111]" : ""}>
          <div className="border-b border-[#111111] px-4 py-3">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#6c6c6c]">
              {corrections.length > 0 ? "Other findings" : "Findings"}
            </h2>
          </div>
          <div className="flex flex-col gap-1 px-4 py-3">
            {otherIssues.map((issue) => {
              const markerIndex = issues.indexOf(issue);
              const interactive = typeof onSelectIssue === "function";
              const active = activeIndex === markerIndex;
              const rowClass = `flex w-full items-start gap-2 rounded-[6px] px-1 py-2 text-left transition ${
                active ? "bg-[#0a0a0a]" : "hover:bg-[#080808]"
              }`;

              return interactive ? (
                <button
                  key={issue.id}
                  type="button"
                  onClick={() => onSelectIssue(active ? null : markerIndex)}
                  className={rowClass}
                >
                  <IssueRowContent issue={issue} markerIndex={markerIndex} />
                </button>
              ) : (
                <div key={issue.id} className={rowClass}>
                  <IssueRowContent issue={issue} markerIndex={markerIndex} />
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
    </article>
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
        className="mt-0.5 grid size-[22px] shrink-0 place-items-center rounded-[4px] text-[10px] font-bold text-white"
        style={{ background: MARKER_COLORS[markerIndex % MARKER_COLORS.length] }}
      >
        {markerIndex + 1}
      </span>
      <p className="min-w-0 flex-1 text-[12px] leading-relaxed text-[#bdbdbd]">
        {issueSentence(issue)}
      </p>
    </>
  );
}
