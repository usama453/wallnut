import type { AssetStatus, ProofStatus, Severity } from "@/types";

export function ScoreRing({ score, size = 96 }: { score: number; size?: number }) {
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  const color = score >= 90 ? "#34d399" : score >= 70 ? "#fbbf24" : "#f87171";
  const stroke = (score / 100) * c;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="#242424"
          strokeWidth="8"
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth="8"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${stroke} ${c}`}
        />
      </svg>
      <div className="absolute text-center">
        <div className="text-2xl font-bold leading-none text-[#fbfbfb]">{score}</div>
        <div className="text-[9px] uppercase tracking-wide text-[#6c6c6c]">/ 100</div>
      </div>
    </div>
  );
}

const STATUS_STYLES: Record<AssetStatus, string> = {
  draft: "border-[#343434] bg-[#242424] text-[#bdbdbd]",
  in_review: "border-blue-900/70 bg-blue-500/10 text-blue-300",
  changes_requested: "border-red-900/70 bg-red-500/10 text-red-300",
  approved: "border-emerald-900/70 bg-emerald-500/10 text-emerald-300",
  published: "border-violet-900/70 bg-violet-500/10 text-violet-300",
};

export function StatusBadge({ status }: { status: AssetStatus }) {
  if (status !== "changes_requested") return null;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-medium capitalize ${STATUS_STYLES[status]}`}
    >
      {status.replace("_", " ")}
    </span>
  );
}

const PROOF_STYLES: Record<ProofStatus, string> = {
  passed: "border-emerald-900/70 bg-emerald-500/10 text-emerald-300",
  needs_review: "border-amber-900/70 bg-amber-500/10 text-amber-300",
  errors: "border-red-900/70 bg-red-500/10 text-red-300",
};

export function ProofBadge({ status }: { status: ProofStatus }) {
  if (status !== "errors") return null;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-medium ${PROOF_STYLES[status]}`}
    >
      Errors
    </span>
  );
}

const SEVERITY_STYLES: Record<Severity, string> = {
  low: "bg-[#292929] text-[#bdbdbd]",
  medium: "bg-amber-500/15 text-amber-300",
  high: "bg-red-500/15 text-red-300",
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${SEVERITY_STYLES[severity]}`}
    >
      {severity}
    </span>
  );
}

export function CategoryBadge({ category }: { category: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-[#242424] px-2 py-0.5 text-[10px] text-[#bdbdbd]">
      {category}
    </span>
  );
}

export function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
