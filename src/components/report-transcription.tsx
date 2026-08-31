export function ReportTranscription({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  return (
    <article
      className={`flex min-h-0 flex-col overflow-hidden rounded-[8px] border border-[#222222] bg-[#060606] shadow-[0_24px_36px_rgba(0,0,0,0.48)] ${className}`}
    >
      <div className="shrink-0 border-b border-[#222222] px-4 py-3">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#6c6c6c]">
          Transcription
        </h2>
      </div>
      <pre className="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap px-4 py-3 font-sans text-[12px] leading-relaxed text-[#bdbdbd]">
        {text}
      </pre>
    </article>
  );
}
