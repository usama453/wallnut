export default function ReportLoading() {
  return (
    <div className="mx-auto w-full max-w-[680px] animate-pulse px-4 pt-6 sm:px-6">
      <div className="h-64 rounded-[8px] bg-[#060606]" />
      <div className="mt-3 flex items-start gap-3">
        <div className="h-32 flex-1 rounded-[8px] bg-[#060606]" />
        <div className="size-14 shrink-0 rounded-full bg-[#111111]" />
      </div>
      <div className="mt-8 space-y-2">
        <div className="h-3 w-full rounded bg-[#0d0d0d]" />
        <div className="h-3 w-2/3 rounded bg-[#0d0d0d]" />
      </div>
    </div>
  );
}
