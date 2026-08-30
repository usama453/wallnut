"use client";

import { useCallback, useEffect, useState } from "react";
import { Spinner } from "@/components/wallnut/icons";
import {
  WALLNUT_BUTTON,
  WALLNUT_FIELD,
  WALLNUT_PANEL,
} from "@/components/wallnut/panel";

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
    return chatId.replace(/@(c\.us|s\.whatsapp\.net|lid)$/, "");
  }

  return (
    <article className={WALLNUT_PANEL}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#111111] px-4 py-3">
        <h2 className="text-[12px] font-bold text-[#fbfbfb]">WhatsApp access</h2>
        <div className="flex overflow-hidden rounded-[6px] border border-[#111111] text-[11px]">
          <button
            type="button"
            disabled={busy}
            onClick={() => post({ action: "mode", mode: "all" })}
            className={`px-3 py-1.5 transition ${
              mode === "all"
                ? "bg-[#0d0d0d] font-bold text-white"
                : "text-[#919191] hover:bg-[#0c0c0c] hover:text-white"
            }`}
          >
            Everyone
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => post({ action: "mode", mode: "allowlist" })}
            className={`border-l border-[#111111] px-3 py-1.5 transition ${
              mode === "allowlist"
                ? "bg-[#0d0d0d] font-bold text-white"
                : "text-[#919191] hover:bg-[#0c0c0c] hover:text-white"
            }`}
          >
            Allowed only
          </button>
        </div>
      </div>

      <div className="px-4 py-4">
        <p className="text-[12px] leading-relaxed text-[#919191]">
          {mode === "all"
            ? "The bot replies to every chat that messages it."
            : "The bot only replies to the chats listed below; everyone else is ignored."}
        </p>

        {error ? (
          <p role="alert" className="mt-3 text-[11px] text-[#e8b4b4]">
            {error}
          </p>
        ) : null}

        {loading ? (
          <p className="mt-4 text-[11px] text-[#6c6c6c]">Loading…</p>
        ) : (
          <>
            {allowed.length > 0 ? (
              <ul className="mt-4 divide-y divide-[#111111] overflow-hidden rounded-[6px] border border-[#111111]">
                {allowed.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center justify-between gap-2 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <span className="text-[12px] text-[#bdbdbd]">
                        {a.label || prettyChat(a.chat_id)}
                      </span>
                      {a.label ? (
                        <span className="mt-0.5 block truncate text-[10px] text-[#555]">
                          {prettyChat(a.chat_id)}
                        </span>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => post({ action: "remove", id: a.id })}
                      className="shrink-0 text-[11px] text-[#919191] transition hover:text-[#e8b4b4] disabled:opacity-60"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            {mode === "allowlist" && recent.length > 0 ? (
              <>
                <h3 className="mt-5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#555]">
                  Recent chats waiting for access
                </h3>
                <ul className="mt-2 divide-y divide-[#111111] overflow-hidden rounded-[6px] border border-[#111111]">
                  {recent.map((c) => (
                    <li
                      key={c.chat_id}
                      className="flex items-center justify-between gap-2 px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <span className="text-[12px] text-[#bdbdbd]">
                          {prettyChat(c.chat_id)}
                        </span>
                        {c.label ? (
                          <span className="mt-0.5 block truncate text-[10px] text-[#555]">
                            “{c.label}”
                          </span>
                        ) : null}
                        <span className="mt-0.5 block text-[10px] text-[#555]">
                          {c.message_count} msg{c.message_count === 1 ? "" : "s"}
                        </span>
                      </div>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          post({ action: "add", chatId: c.chat_id, label: c.label?.slice(0, 60) })
                        }
                        className="shrink-0 rounded-full border border-[#1f3d28] bg-[#101a14] px-2.5 py-1 text-[11px] font-medium text-[#4ade80] transition hover:border-[#2a5a3a] disabled:opacity-60"
                      >
                        Allow
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}

            <form
              className="mt-4 flex flex-wrap gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (manualId.trim()) {
                  void post({ action: "add", chatId: manualId.trim() }).then(() =>
                    setManualId(""),
                  );
                }
              }}
            >
              <input
                value={manualId}
                onChange={(e) => setManualId(e.target.value)}
                placeholder="Add by phone number or group JID…"
                className={`min-w-0 flex-1 ${WALLNUT_FIELD}`}
              />
              <button
                type="submit"
                disabled={busy || !manualId.trim()}
                aria-busy={busy}
                className={WALLNUT_BUTTON}
              >
                {busy ? <Spinner /> : null}
                Add
              </button>
            </form>
          </>
        )}
      </div>
    </article>
  );
}
