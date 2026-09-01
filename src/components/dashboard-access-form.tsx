"use client";

import { useState } from "react";
import { Spinner } from "@/components/wallnut/icons";
import { Reveal } from "@/components/wallnut/reveal";

export function DashboardAccessForm({
  orgSlug,
  orgName,
}: {
  orgSlug: string;
  orgName: string;
}) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/org/dashboard-access", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: orgSlug, password }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.error ?? "Unable to unlock workspace");
      }
      const redirectTo =
        typeof body?.redirect === "string" ? body.redirect : `/${orgSlug}`;
      window.location.assign(redirectTo);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to unlock workspace");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-[360px] flex-col justify-center px-4 py-14">
      <Reveal className="text-center" delayMs={60}>
        <h1 className="text-[27px] font-bold leading-none tracking-[-0.72px] text-white">
          Admin password
        </h1>
        <p className="mt-2.5 text-[12px] text-[#919191]">
          Access {orgName} as an admin
        </p>
      </Reveal>

      <Reveal delayMs={120}>
        <form onSubmit={handleSubmit} className="mt-8">
          <label htmlFor="dashboard-password" className="text-[11px] text-[#919191]">
            Password
          </label>
          <input
            id="dashboard-password"
            type="password"
            autoFocus
            required
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setError(null);
            }}
            className="mt-2 w-full rounded-[8px] border border-[#222222] bg-[#060606] px-3.5 py-3 text-[13px] text-[#fbfbfb] focus:border-[#2e2e2e] focus:outline-none"
          />

          {error ? (
            <p
              role="alert"
              className="mt-3 rounded-[7px] border border-red-950 bg-red-950/20 px-3 py-2 text-[11px] leading-relaxed text-[#e8b4b4]"
            >
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            aria-busy={loading}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-[8px] bg-[#fbfbfb] py-3 text-[13px] font-bold text-black transition hover:bg-[#e8e8e8] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? <Spinner /> : null}
            {loading ? "Checking…" : "Open workspace"}
          </button>
        </form>
      </Reveal>
    </main>
  );
}
