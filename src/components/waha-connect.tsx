"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { WahaSessionState } from "@/lib/whatsapp/session";

export function WahaConnect({
  initialState,
  canManage,
}: {
  initialState: WahaSessionState;
  canManage: boolean;
}) {
  const [state, setState] = useState(initialState);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const autoStarted = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/whatsapp/session?qr=1", {
        cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not check WAHA");
      setState(body);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not check WAHA");
    }
  }, []);

  useEffect(() => {
    const delay =
      state.status === "STARTING" ||
      state.status === "SCAN_QR_CODE" ||
      state.status === "STOPPED" ||
      state.status === "FAILED"
        ? 5_000
        : 30_000;
    const timer = window.setInterval(() => void refresh(), delay);
    return () => window.clearInterval(timer);
  }, [refresh, state.status]);

  const runAction = useCallback(async (
    action: "create" | "start" | "restart" | "logout" | "configure-webhook",
  ) => {
    setBusy(action);
    setError(null);
    try {
      const response = await fetch("/api/whatsapp/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "WAHA operation failed");
      setState(body);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "WAHA operation failed");
    } finally {
      setBusy(null);
    }
  }, []);

  useEffect(() => {
    if (!canManage || autoStarted.current) return;
    if (state.status !== "STOPPED" && state.status !== "FAILED") return;
    autoStarted.current = true;
    void runAction(state.status === "STOPPED" ? "start" : "restart");
  }, [canManage, runAction, state.status]);

  const status = statusCopy(state.status);
  const canOperate = canManage && state.configured && state.reachable;

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-white/10 bg-zinc-950 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`h-2.5 w-2.5 rounded-full ${status.dot}`}
                aria-hidden
              />
              <h2 className="text-base font-semibold text-white">{status.label}</h2>
            </div>
            <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
              {state.error ?? status.description}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            className="rounded-full border border-white/15 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-white/30 hover:text-white"
          >
            Refresh
          </button>
        </div>

        {error ? (
          <p
            className="mt-4 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        {state.qrDataUrl || state.status === "SCAN_QR_CODE" ? (
          canManage ? (
          <div className="mt-6 grid gap-6 sm:grid-cols-[220px_1fr] sm:items-center">
            <div className="grid aspect-square place-items-center rounded-2xl bg-white p-3">
              {state.qrDataUrl ? (
                // WAHA returns a short-lived data URL from our authenticated proxy.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={state.qrDataUrl}
                  alt="WhatsApp connection QR code"
                  className="h-full w-full"
                />
              ) : (
                <span className="text-center text-sm text-zinc-600">
                  QR code is loading…
                </span>
              )}
            </div>
            <div>
              <p className="text-sm font-medium text-white">Scan with WhatsApp</p>
              <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-zinc-400">
                <li>Open WhatsApp on your phone.</li>
                <li>Open Linked devices, then choose Link a device.</li>
                <li>Scan this code. The status updates automatically.</li>
              </ol>
              <p className="mt-3 text-xs text-zinc-500">
                QR codes expire quickly. Use Refresh if WhatsApp rejects it.
              </p>
            </div>
          </div>
          ) : (
          <p className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-zinc-400">
            An organization owner or admin must scan the pairing code.
          </p>
          )
        ) : null}

        <div className="mt-6 flex flex-wrap gap-2">
          {state.status === "NOT_CREATED" ? (
            <ActionButton
              busy={busy === "create"}
              disabled={!canOperate || busy !== null}
              onClick={() => void runAction("create")}
            >
              Create and start session
            </ActionButton>
          ) : null}
          {state.status === "STOPPED" ? (
            <ActionButton
              busy={busy === "start"}
              disabled={!canOperate || busy !== null}
              onClick={() => void runAction("start")}
            >
              Start session
            </ActionButton>
          ) : null}
          {state.status === "FAILED" || state.status === "SCAN_QR_CODE" ? (
            <ActionButton
              busy={busy === "restart"}
              disabled={!canOperate || busy !== null}
              onClick={() => void runAction("restart")}
            >
              Restart session
            </ActionButton>
          ) : null}
          {state.status === "WORKING" &&
          state.webhookUrl &&
          !state.webhookConfigured ? (
            <ActionButton
              busy={busy === "configure-webhook"}
              disabled={!canOperate || busy !== null}
              onClick={() => void runAction("configure-webhook")}
            >
              Configure webhook
            </ActionButton>
          ) : null}
          {canOperate &&
          state.status !== "NOT_CREATED" &&
          state.status !== "STARTING" ? (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => {
                if (
                  window.confirm(
                    "Reset this WhatsApp pairing? The current linked-device session will be removed and a new QR code will be required.",
                  )
                ) {
                  void runAction("logout");
                }
              }}
              className="rounded-full border border-red-500/30 px-4 py-2 text-sm font-medium text-red-300 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy === "logout" ? "Resetting…" : "Reset pairing"}
            </button>
          ) : null}
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-zinc-950 p-6">
        <h2 className="text-sm font-semibold text-white">Connection details</h2>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
          <Detail label="WAHA endpoint" value={state.endpoint ?? "Not configured"} />
          <Detail label="Session" value={state.session} />
          <Detail
            label="WhatsApp account"
            value={state.me?.pushName || state.me?.id || "Not paired"}
          />
          <Detail
            label="Inbound webhook"
            value={
              state.webhookConfigured
                ? "Configured"
                : state.webhookUrl
                  ? "Ready to configure"
                  : "Public app URL required"
            }
            good={state.webhookConfigured}
          />
        </dl>
        {!state.webhookUrl ? (
          <p className="mt-4 text-xs leading-5 text-zinc-500">
            Set <code className="text-zinc-300">WAHA_WEBHOOK_URL</code>, or set{" "}
            <code className="text-zinc-300">NEXT_PUBLIC_APP_URL</code> to a public
            app URL, so WAHA can deliver incoming messages.
          </p>
        ) : null}
        {!state.reachable && state.endpoint ? (
          <p className="mt-4 text-xs leading-5 text-zinc-500">
            Start WAHA separately at this endpoint. The Next.js app and WAHA
            cannot listen on the same local port.
          </p>
        ) : null}
      </section>
    </div>
  );
}

function ActionButton({
  children,
  busy,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {busy ? "Working…" : children}
    </button>
  );
}

function Detail({
  label,
  value,
  good = false,
}: {
  label: string;
  value: string;
  good?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-[0.16em] text-zinc-600">{label}</dt>
      <dd className={`mt-1 break-all ${good ? "text-emerald-300" : "text-zinc-300"}`}>
        {value}
      </dd>
    </div>
  );
}

function statusCopy(status: string) {
  switch (status) {
    case "WORKING":
      return {
        label: "WhatsApp connected",
        description: "The session is online and ready to send and receive messages.",
        dot: "bg-emerald-400",
      };
    case "SCAN_QR_CODE":
      return {
        label: "Scan the QR code",
        description: "Pair this WAHA session with the WhatsApp account you want Wallnut to use.",
        dot: "bg-amber-300",
      };
    case "STARTING":
      return {
        label: "Session starting",
        description: "WAHA is preparing the WhatsApp session.",
        dot: "animate-pulse bg-amber-300",
      };
    case "STOPPED":
      return {
        label: "Session stopped",
        description: "Start the saved session to reconnect WhatsApp.",
        dot: "bg-zinc-500",
      };
    case "FAILED":
      return {
        label: "Session needs attention",
        description: "Restart the session to generate a fresh QR code.",
        dot: "bg-red-400",
      };
    case "NOT_CREATED":
      return {
        label: "No WAHA session",
        description: "Create the configured session, then pair it using WhatsApp.",
        dot: "bg-zinc-500",
      };
    case "NOT_CONFIGURED":
      return {
        label: "WAHA is not configured",
        description: "Add the WAHA endpoint and API key to the app environment.",
        dot: "bg-red-400",
      };
    case "UNREACHABLE":
      return {
        label: "WAHA is offline",
        description: "The app could not reach the configured WAHA endpoint.",
        dot: "bg-red-400",
      };
    default:
      return {
        label: "Connection status unknown",
        description: "Refresh the connection after checking the WAHA service.",
        dot: "bg-zinc-500",
      };
  }
}
