"use client";

import { useCallback, useEffect, useState } from "react";

interface AllowedRow {
  id: string;
  chat_id: string;
  label: string | null;
  created_at: string;
}
interface RecentRow {
  chat_id: string;
  label: string | null;
  message_count: number;
  last_message_at: string;
}

export function WhatsAppAccess() {
  const [mode, setMode] = useState<"all" | "allowlist">("all");
  const [allowed, setAllowed] = useState<AllowedRow[]>([]);
  const [recent, setRecent] = useState<RecentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [manualId, setManualId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/whatsapp/access");
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load");
      const data = await res.json();
      setMode(data.mode);
      setAllowed(data.allowed);
      setRecent(data.recent);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch("/api/whatsapp/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Request failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  function prettyChat(chatId: string) {
    if (chatId.endsWith("@g.us")) return `Group ${chatId.split("@")[0].slice(0, 12)}…`;
    return chatId.replace(/@(s\.whatsapp\.net|lid)$/, "");
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">WhatsApp access</h2>
        <div className="flex rounded-lg border border-slate-700 text-xs overflow-hidden">
          <button
            disabled={busy}
            onClick={() => post({ action: "mode", mode: "all" })}
            className={`px-3 py-1.5 ${mode === "all" ? "bg-indigo-500/30 text-indigo-200" : "text-slate-400 hover:bg-slate-800"}`}
          >
            Everyone
          </button>
          <button
            disabled={busy}
            onClick={() => post({ action: "mode", mode: "allowlist" })}
            className={`px-3 py-1.5 ${mode === "allowlist" ? "bg-indigo-500/30 text-indigo-200" : "text-slate-400 hover:bg-slate-800"}`}
          >
            Allowed only
          </button>
        </div>
      </div>
      <p className="mt-1 text-sm text-slate-400">
        {mode === "all"
          ? "The bot replies to every chat that messages it."
          : "The bot only replies to the chats listed below; everyone else is ignored."}
      </p>

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      {loading ? (
        <p className="mt-3 text-xs text-slate-500">Loading…</p>
      ) : (
        <>
          {allowed.length > 0 && (
            <ul className="mt-3 divide-y divide-slate-800 rounded-lg border border-slate-800">
              {allowed.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <span className="text-slate-200">{a.label || prettyChat(a.chat_id)}</span>
                    {!a.label && <span className="ml-1 text-xs text-slate-500">{prettyChat(a.chat_id)}</span>}
                  </div>
                  <button
                    disabled={busy}
                    onClick={() => post({ action: "remove", id: a.id })}
                    className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 hover:text-red-300"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}

          {mode === "allowlist" && recent.length > 0 && (
            <>
              <h3 className="mt-4 text-xs font-medium uppercase tracking-wide text-slate-500">
                Recent chats waiting for access
              </h3>
              <ul className="mt-2 divide-y divide-slate-800 rounded-lg border border-slate-800">
                {recent.map((c) => (
                  <li key={c.chat_id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <span className="text-slate-200">{prettyChat(c.chat_id)}</span>
                      {c.label && <span className="block truncate text-xs text-slate-500">“{c.label}”</span>}
                      <span className="text-xs text-slate-600">
                        {c.message_count} msg{c.message_count === 1 ? "" : "s"}
                      </span>
                    </div>
                    <button
                      disabled={busy}
                      onClick={() =>
                        post({ action: "add", chatId: c.chat_id, label: c.label?.slice(0, 60) })
                      }
                      className="rounded-md bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-300 hover:bg-emerald-500/25"
                    >
                      Allow
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          <form
            className="mt-4 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (manualId.trim()) {
                void post({ action: "add", chatId: manualId.trim() }).then(() => setManualId(""));
              }
            }}
          >
            <input
              value={manualId}
              onChange={(e) => setManualId(e.target.value)}
              placeholder="Add by phone number or group JID…"
              className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={busy || !manualId.trim()}
              className="rounded-lg bg-indigo-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-400 disabled:opacity-40"
            >
              Add
            </button>
          </form>
        </>
      )}
    </div>
  );
}
