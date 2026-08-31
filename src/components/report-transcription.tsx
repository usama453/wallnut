export function ReportTranscription({ text }: { text: string }) {
  return (
    <article className="mt-3 overflow-hidden rounded-[8px] border border-[#111111] bg-[#060606] shadow-[0_24px_36px_rgba(0,0,0,0.48)]">
      <div className="flex items-center justify-between gap-3 border-b border-[#111111] px-4 py-3">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#6c6c6c]">
          Transcription
        </h2>
        <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[#555]">
          Super admin
        </span>
      </div>
      <pre className="max-h-[min(50vh,420px)] overflow-y-auto whitespace-pre-wrap px-4 py-3 font-sans text-[12px] leading-relaxed text-[#bdbdbd]">
        {text}
      </pre>
    </article>
  );
}
