"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { analyzeDeal } from "@/lib/sales/actions";

const SAMPLE_TRANSCRIPT = `[Salesperson]
Thanks for joining, Sarah. To recap, you're looking at replacing how Acme handles creative approvals, right?

[Sarah]
Yes. We're currently using Adobe Workfront, and our biggest problem is that approvals take around two weeks. Every campaign launch gets delayed.

[Salesperson]
That's painful. How much does that two-week delay actually cost?

[Sarah]
Honestly, probably tens of thousands per quarter in missed campaign windows. We could probably go up to around $75k for the right solution.

[Salesperson]
Who signs off on a purchase at that level?

[Sarah]
That would be our CFO, John Smith. I don't want to bother him yet, but we'd need his buy-in eventually.

[Salesperson]
What's your timeline?

[Sarah]
We're hoping to have this decided before the end of Q3. We're also looking at a tool called Filestage, but it seems more for approvals than full workflows.

[Salesperson]
Got it. What would make this a no-brainer for you?

[Sarah]
If we could cut approval time to under 48 hours and show the VP of Marketing the workflow, that would be strong.

[Salesperson]
Great. I'll send over a short summary and a proposal for a walkthrough with your team.`;

interface Props {
  dealId: string;
}

export function TranscriptForm({ dealId }: Props) {
  const router = useRouter();
  const [transcript, setTranscript] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!transcript.trim()) return;
    setError(null);
    startTransition(async () => {
      try {
        await analyzeDeal(dealId, transcript.trim(), title.trim() || undefined);
        setTranscript("");
        setTitle("");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Analysis failed");
      }
    });
  };

  return (
    <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight text-slate-900">Analyze a transcript</h2>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setTranscript(SAMPLE_TRANSCRIPT)}
            className="text-[11px] font-medium text-indigo-600 hover:text-indigo-700"
          >
            Insert sample transcript
          </button>
          <span className="text-[11px] text-slate-400">Paste a call, send to the navigator</span>
        </div>
      </div>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Transcript title (optional) — e.g. Aug 15 discovery call"
        className="mb-3 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none"
      />

      <textarea
        value={transcript}
        onChange={(e) => setTranscript(e.target.value)}
        placeholder={'Paste the transcript here…\n\n[Salesperson]\nThanks for joining…\n[Sarah]\nWe are currently using Adobe…'}
        rows={9}
        className="thin-scroll w-full resize-y rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 font-mono text-[13px] leading-relaxed text-slate-800 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none"
      />

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      <div className="mt-3 flex items-center justify-between">
        <p className="text-[11px] text-slate-400">
          The AI reads this together with everything already known about the deal.
        </p>
        <button
          type="submit"
          disabled={!transcript.trim() || pending}
          className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? "Analyzing…" : "Analyze deal"}
        </button>
      </div>
    </form>
  );
}