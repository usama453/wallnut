export default function OrgLoading() {
  return (
    <div className="mx-auto max-w-5xl animate-pulse">
      <div className="flex flex-col items-center py-4 sm:py-8">
        <div className="h-8 w-40 rounded bg-[#111111]" />
        <div className="mt-3 h-3 w-56 rounded bg-[#0d0d0d]" />
        <div className="mt-12 flex items-end justify-center gap-2">
          <div className="size-9 rounded-full bg-[#111111]" />
          <div className="size-11 rounded-full bg-[#141414]" />
          <div className="size-9 rounded-full bg-[#111111]" />
        </div>
        <div className="mt-8 w-full max-w-[680px] space-y-3">
          <div className="h-12 rounded-[8px] bg-[#060606]" />
          <div className="h-36 rounded-[8px] bg-[#060606]" />
          <div className="h-36 rounded-[8px] bg-[#060606]" />
        </div>
      </div>
    </div>
  );
}
