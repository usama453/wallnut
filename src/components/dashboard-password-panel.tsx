"use client";

import { useEffect, useState } from "react";
import { Spinner } from "@/components/wallnut/icons";
import { WALLNUT_PANEL } from "@/components/wallnut/panel";

export function DashboardPasswordPanel({
  orgSlug,
  initialConfigured,
  initialPassword = "",
}: {
  orgSlug: string;
  initialConfigured: boolean;
  initialPassword?: string;
}) {
  const [configured, setConfigured] = useState(initialConfigured);
  const [password, setPassword] = useState(initialPassword);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const response = await fetch(`/api/settings/dashboard-password?org=${encodeURIComponent(orgSlug)}`, {
        cache: "no-store",
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || cancelled) return;
      setConfigured(Boolean(body?.configured));
      if (typeof body?.password === "string") setPassword(body.password);
    })();
    return () => {
      cancelled = true;
    };
  }, [orgSlug]);

  async function savePassword(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/settings/dashboard-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org: orgSlug, password }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.error ?? "Failed to save password");
      }
      setConfigured(Boolean(body?.configured));
      if (typeof body?.password === "string") setPassword(body.password);
      setMessage(configured ? "Password updated." : "Password saved.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to save password");
    } finally {
      setBusy(false);
    }
  }

  async function removePassword() {
    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/settings/dashboard-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org: orgSlug, clear: true }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.error ?? "Failed to remove password");
      }
      setConfigured(false);
      setPassword("");
      setMessage("Password removed. Guest dashboard access is disabled.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to remove password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className={WALLNUT_PANEL}>
      <div className="border-b border-[#222222] px-4 py-3">
        <h2 className="text-[12px] font-bold text-[#fbfbfb]">Guest dashboard password</h2>
        <p className="mt-1 text-[11px] leading-relaxed text-[#6c6c6c]">
          Lets people open this workspace from a public report without signing in. Applies to
          this organization only.
        </p>
      </div>

      <div className="px-4 py-4">
        <div className="mb-4 flex items-center gap-2">
          <span
            className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
              configured
                ? "border-[#1f3d28] bg-[#101a14] text-[#4ade80]"
                : "border-[#222222] bg-[#0a0a0a] text-[#919191]"
            }`}
          >
            {configured ? "● Password set" : "○ No password"}
          </span>
        </div>

        <form onSubmit={savePassword}>
          <label htmlFor="dashboard-password" className="text-[11px] text-[#919191]">
            Password
          </label>
          <input
            id="dashboard-password"
            type="text"
            autoComplete="off"
            minLength={4}
            required
            value={password}
            disabled={busy}
            onChange={(event) => {
              setPassword(event.target.value);
              setError(null);
              setMessage(null);
            }}
            placeholder="Set a guest password"
            className="mt-2 w-full rounded-[8px] border border-[#222222] bg-[#060606] px-3.5 py-3 font-mono text-[13px] text-[#fbfbfb] placeholder:text-[#6c6c6c] focus:border-[#2e2e2e] focus:outline-none disabled:opacity-60"
          />

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={busy || !password.trim()}
              className="inline-flex items-center gap-2 rounded-[8px] bg-[#fbfbfb] px-4 py-2.5 text-[12px] font-bold text-black transition hover:bg-[#e8e8e8] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? <Spinner /> : null}
              {configured ? "Update password" : "Save password"}
            </button>

            {configured ? (
              <button
                type="button"
                disabled={busy}
                onClick={removePassword}
                className="rounded-[8px] border border-[#222222] px-4 py-2.5 text-[12px] font-medium text-[#bdbdbd] transition hover:bg-[#0a0a0a] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Remove password
              </button>
            ) : null}
          </div>
        </form>

        {busy ? (
          <p className="mt-3 flex items-center gap-2 text-[11px] text-[#6c6c6c]">
            <Spinner /> Saving…
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="mt-3 text-[11px] text-[#e8b4b4]">
            {error}
          </p>
        ) : null}

        {message ? (
          <p className="mt-3 text-[11px] text-[#a7d7bd]">{message}</p>
        ) : (
          <p className="mt-3 text-[11px] leading-relaxed text-[#555]">
            This password is visible here so you can share it with clients. Report viewers use
            the &ldquo;Open workspace&rdquo; button, then enter it to see Overview and
            Rankings.
          </p>
        )}
      </div>
    </article>
  );
}
