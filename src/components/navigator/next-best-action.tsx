"use client";

import { useState, useTransition } from "react";
import type { DealActionRow } from "@/lib/sales/types";
import type { DealAnalysis } from "@/lib/sales/types";
import { completeAction, regenerateMessage } from "@/lib/sales/actions";
import { priorityLabel } from "@/lib/sales/format";

interface Props {
  dealId: string;
  action: DealActionRow | null;
  recommendedMessage?: DealAnalysis["recommended_message"];
}

export function NextBestAction({ dealId, action, recommendedMessage }: Props) {
  const [draftOpen, setDraftOpen] = useState(false);
  const [message, setMessage] = useState(recommendedMessage ?? null);
  const [messageLoading, setMessageLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  const priority =
    action?.priority === "high"
      ? "bg-amber-100 text-amber-800"
      : action?.priority === "low"
        ? "bg-slate-100 text-slate-600"
        : "bg-indigo-100 text-indigo-700";

  const handleComplete = () => {
    if (!action) return;
    startTransition(async () => {
      await completeAction(action.id);
    });
  };

  const handleRegenerate = async () => {
    if (!action) return;
    setMessageLoading(true);
    try {
      const m = await regenerateMessage(dealId);
      setMessage(m);
    } finally {
      setMessageLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!message?.body) return;
    const text = `${message.subject ? `Subject: ${message.subject}\n\n` : ""}${message.body}`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-600 via-indigo-600 to-violet-600 p-6 text-white shadow-lg shadow-indigo-100">
      <div className="flex items-center justify-between">
        <span className="rounded-md bg-white/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-widest text-white">
          Next best action
        </span>
        {action && (
          <div className="flex items-center gap-2">
            {action.priority && (
              <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${priority}`}>
                {priorityLabel(action.priority)} priority
              </span>
            )}
            {action.timing && (
              <span className="rounded-md bg-white/15 px-2 py-0.5 text-[11px] font-medium">
                {action.timing}
              </span>
            )}
          </div>
        )}
      </div>

      <h2 className="mt-4 max-w-2xl text-2xl font-semibold leading-snug tracking-tight">
        {action?.title ?? "Analyze a transcript to get your next best action"}
      </h2>

      {action?.description && (
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-indigo-100">{action.description}</p>
      )}

      {action?.reason && (
        <div className="mt-5 max-w-2xl rounded-xl bg-white/10 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-indigo-200">Why</div>
          <p className="mt-1 text-sm leading-relaxed text-white/95">{action.reason}</p>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setDraftOpen((v) => !v)}
          disabled={!action}
          className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-indigo-700 transition-colors hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {draftOpen ? "Hide draft" : "Draft message"}
        </button>
        <button
          type="button"
          onClick={handleComplete}
          disabled={!action || action.status !== "open" || pending}
          className="rounded-xl border border-white/40 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {action?.status === "open" ? (pending ? "Marking…" : "Mark complete") : "Completed ✓"}
        </button>
      </div>

      {draftOpen && (
        <div className="mt-5 max-w-3xl rounded-xl border border-white/20 bg-slate-900/30 p-5">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-semibold uppercase tracking-widest text-indigo-200">
              Suggested message
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleRegenerate}
                disabled={messageLoading}
                className="rounded-lg border border-white/25 px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-white/10 disabled:opacity-40"
              >
                {messageLoading ? "Generating…" : "Regenerate"}
              </button>
              <button
                type="button"
                onClick={handleCopy}
                disabled={!message?.body}
                className="rounded-lg border border-white/25 px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-white/10 disabled:opacity-40"
              >
                {copied ? "Copied ✓" : "Copy"}
              </button>
            </div>
          </div>

          {message ? (
            <div className="mt-3 space-y-3">
              {message.subject && (
                <div className="text-sm text-white">
                  <span className="font-semibold">{message.subject}</span>
                </div>
              )}
              <pre className="whitespace-pre-wrap rounded-lg bg-slate-950/50 p-4 font-sans text-sm leading-relaxed text-slate-100">
                {message.body}
              </pre>
              {message.explanation && (
                <p className="text-xs leading-relaxed text-indigo-200">
                  <span className="font-semibold text-indigo-100">Why this message: </span>
                  {message.explanation}
                </p>
              )}
            </div>
          ) : (
            <p className="mt-3 text-sm text-white/70">
              Analyze a transcript and the navigator will draft a follow-up message.
            </p>
          )}
        </div>
      )}
    </section>
  );
}