export function MetricChipGroup({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`inline-flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-full border border-[#111111] bg-[#060606] px-3.5 py-1.5 ${className}`}
    >
      {children}
    </div>
  );
}

export function MetricChip({
  label,
  value,
  className = "",
  grouped = false,
}: {
  label: string;
  value: string | number;
  className?: string;
  grouped?: boolean;
}) {
  const shell = grouped
    ? "inline-flex items-center gap-1.5 text-[11px] leading-none text-[#919191]"
    : "inline-flex items-center gap-1.5 rounded-full border border-[#111111] px-2.5 py-1.5 text-[11px] leading-none text-[#919191]";

  return (
    <span className={`${shell} ${className}`}>
      <span className="font-medium tabular-nums text-[#d0d0d0]">{value}</span>
      {label}
    </span>
  );
}
