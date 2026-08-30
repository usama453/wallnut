import { markerPosition } from "@/lib/proof/issue-locations";
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

type PreviewPage = { url: string; width: number; height: number };

export function ReportPreview({
  title,
  kind,
  url,
  previewMeta,
  issues,
  activeIndex = null,
  onSelectIssue,
}: {
  title: string;
  kind: "image" | "pdf";
  url: string;
  previewMeta?: { pages: PreviewPage[] } | null;
  issues: ProofIssue[];
  activeIndex?: number | null;
  onSelectIssue?: (index: number | null) => void;
}) {
  const interactive = typeof onSelectIssue === "function";

  return (
    <section className="overflow-hidden rounded-[8px] border border-[#111111] bg-[#060606] shadow-[0_24px_36px_rgba(0,0,0,0.48)]">
      <div className="relative bg-[#080808]">
        {previewMeta?.pages?.length ? (
          <div className="space-y-1">
            {previewMeta.pages.map((page, pageIndex) => {
              const isPage1 = pageIndex === 0;
              const boxStyle =
                page.width && page.height
                  ? ({ aspectRatio: `${page.width}/${page.height}` } as const)
                  : undefined;

              return (
                <div
                  key={page.url ?? pageIndex}
                  className="relative mx-auto max-w-full"
                  style={boxStyle}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={page.url}
                    alt={`${title} — page ${pageIndex + 1}`}
                    className="absolute inset-0 block h-full w-full object-cover"
                  />
                  {isPage1
                    ? issues.map((issue, index) => {
                        const position = markerPosition(issue);
                        if (!position) return null;
                        const active = activeIndex === index;

                        const marker = (
                          <span
                            className="grid size-[22px] place-items-center rounded-full text-[11px] font-bold text-white shadow-lg transition"
                            style={{
                              background: MARKER_COLORS[index % MARKER_COLORS.length],
                              transform: active ? "scale(1.2)" : undefined,
                              boxShadow: active ? "0 0 0 3px rgba(255,255,255,.45)" : undefined,
                            }}
                          >
                            {index + 1}
                          </span>
                        );

                        if (!interactive) {
                          return (
                            <span
                              key={issue.id}
                              className="absolute -translate-x-1/2 -translate-y-1/2"
                              style={{ left: position.left, top: position.top }}
                            >
                              {marker}
                            </span>
                          );
                        }

                        return (
                          <button
                            key={issue.id}
                            type="button"
                            aria-label={issue.title}
                            onClick={() => onSelectIssue(active ? null : index)}
                            className="absolute -translate-x-1/2 -translate-y-1/2"
                            style={{ left: position.left, top: position.top, zIndex: active ? 20 : 10 }}
                          >
                            {marker}
                          </button>
                        );
                      })
                    : null}
                </div>
              );
            })}
          </div>
        ) : kind === "pdf" ? (
          <iframe src={`${url}#toolbar=0`} title={title} className="block h-[min(70vh,640px)] w-full" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={title} className="block w-full" />
        )}
      </div>
    </section>
  );
}
