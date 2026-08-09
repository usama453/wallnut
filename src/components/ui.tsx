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
          stroke="#1e2533"
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
        <div className="text-2xl font-bold leading-none">{score}</div>
        <div className="text-[10px] uppercase tracking-wide text-slate-500">/ 100</div>
      </div>
    </div>
  );
}

const STATUS_STYLES: Record<AssetStatus, string> = {
  draft: "bg-slate-700 text-slate-200",
  in_review: "bg-blue-500/15 text-blue-300",
  changes_requested: "bg-red-500/15 text-red-300",
  approved: "bg-emerald-500/15 text-emerald-300",
  published: "bg-indigo-500/15 text-indigo-300",
};

export function StatusBadge({ status }: { status: AssetStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[status]}`}
    >
      {status.replace("_", " ")}
    </span>
  );
}

const PROOF_STYLES: Record<ProofStatus, string> = {
  passed: "bg-emerald-500/15 text-emerald-300",
  needs_review: "bg-amber-500/15 text-amber-300",
  errors: "bg-red-500/15 text-red-300",
};

export function ProofBadge({ status }: { status: ProofStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${PROOF_STYLES[status]}`}
    >
      {status === "passed" ? "✅ Passed" : status === "needs_review" ? "⚠ Needs review" : "❌ Errors"}
    </span>
  );
}

const SEVERITY_STYLES: Record<Severity, string> = {
  low: "bg-slate-700 text-slate-300",
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
    <span className="inline-flex items-center rounded-full bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300">
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
