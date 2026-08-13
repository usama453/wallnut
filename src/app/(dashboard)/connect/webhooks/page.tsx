"use client";

import { useCallback, useEffect, useState } from "react";

interface WebhookEvent {
  id: number;
  direction: string;
  phone_number_id: string | null;
  waba_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

export default function WebhooksPage() {
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/webhooks");
    const body = await res.json();
    setEvents(body.events ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Webhook viewer</h1>
          <p className="mt-1 text-sm text-slate-400">
            Raw events WhatsApp sent to this app — handy during App Review and QA.
          </p>
        </div>
        <button
          onClick={refresh}
          className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-700"
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : events.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-10 text-center">
          <p className="text-sm text-slate-400">No webhook events yet.</p>
          <p className="mt-1 text-xs text-slate-500">
            Send a message to your connected number and it will show up here.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {events.map((e) => (
            <div key={e.id} className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50">
              <button
                onClick={() => setOpen(open === e.id ? null : e.id)}
                className="flex w-full items-center justify-between px-4 py-3 text-left"
              >
                <div className="flex items-center gap-3">
                  <span className={`size-2 rounded-full ${e.direction === "inbound" ? "bg-emerald-400" : "bg-sky-400"}`} />
                  <span className="text-sm font-medium text-slate-200">
                    {e.direction === "inbound" ? "inbound" : "outbound"}
                  </span>
                  {e.phone_number_id && (
                    <span className="text-xs text-slate-500">phone {e.phone_number_id}</span>
                  )}
                </div>
                <span className="text-xs text-slate-500">
                  {new Date(e.created_at).toLocaleString()}
                </span>
              </button>
              {open === e.id && (
                <pre className="thin-scroll max-h-96 overflow-auto border-t border-slate-800 bg-slate-950/60 p-4 text-xs text-slate-300">
                  {JSON.stringify(e.payload, null, 2)}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
