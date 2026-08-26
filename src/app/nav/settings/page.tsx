export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const provider = process.env.AI_PROVIDER ?? "gemini";
  const aiConfigured = Boolean(process.env.GEMINI_API_KEY);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">Configuration for this MVP.</p>
      </div>

      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold tracking-tight text-slate-900">AI provider</h2>
          <div className="mt-3 flex items-center gap-2 text-[13px]">
            <span
              className={`inline-block size-2 rounded-full ${aiConfigured ? "bg-emerald-500" : "bg-amber-500"}`}
            />
            <span className="text-slate-700">
              {aiConfigured ? `${provider} configured (${process.env.GEMINI_MODEL ?? "default model"})` : "Local analysis mode — no API key set"}
            </span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-400">
            When no API key is configured, transcripts are analyzed with a local deterministic
            engine so the product still works end-to-end. Set{" "}
            <code className="rounded bg-slate-100 px-1 py-0.5 text-[11px]">GEMINI_API_KEY</code> in{" "}
            <code className="rounded bg-slate-100 px-1 py-0.5 text-[11px]">.env.local</code> for full
            AI analysis.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold tracking-tight text-slate-900">About</h2>
          <p className="mt-3 text-[13px] leading-relaxed text-slate-500">
            AI Sales Navigator reads every sales call transcript together with the existing deal
            state, then answers four questions: where is this deal, what is blocking it, what is
            missing, and what is the single highest-impact next action.
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-slate-500">
            Deal memory is preserved between analyses — budget changes, new competitors, and stage
            moves are all recorded on the activity timeline.
          </p>
        </div>
      </div>
    </div>
  );
}