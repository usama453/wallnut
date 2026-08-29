export function MetricChip({
  label,
  value,
  className = "",
}: {
  label: string;
  value: string | number;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-[#2e2e2e] px-2.5 py-1.5 text-[11px] leading-none text-[#919191] ${className}`}
    >
      <span className="font-medium tabular-nums text-[#d0d0d0]">{value}</span>
      {label}
    </span>
  );
}
