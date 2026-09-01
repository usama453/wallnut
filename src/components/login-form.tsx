"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { BackIcon, Spinner } from "@/components/wallnut/icons";
import { Reveal } from "@/components/wallnut/reveal";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackError = searchParams.get("error");
  const redirectTo = safePath(searchParams.get("redirect"), "/settings");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    callbackError ? callbackErrorMessage(callbackError) : null,
  );

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (authError) throw authError;
      await verifySuperAdminOrSignOut(supabase);
      router.push(redirectTo);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to sign in. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-[calc(100vh-3.5rem)] items-center justify-center overflow-hidden px-4 py-14">
      <Link
        href="/"
        className="absolute left-[22px] top-[14px] flex items-center gap-1 text-[12px] text-[#919191] transition hover:text-white"
      >
        <BackIcon />
        Organizations
      </Link>

      <div className="w-full max-w-[360px]">
        <Reveal className="flex flex-col items-center" delayMs={60}>
          <div className="mb-4 flex size-11 items-center justify-center rounded-[10px] bg-[#3d5a80] text-[14px] font-bold text-white">
            W
          </div>
          <h1 className="text-center text-[27px] font-bold leading-none tracking-[-0.72px] text-white">
            Admin sign in
          </h1>
          <p className="mt-2.5 text-center text-[12px] text-[#919191]">
            Platform administrators only
          </p>
        </Reveal>

        <Reveal delayMs={180}>
          <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-3">
            <label htmlFor="login-email" className="text-[11px] text-[#919191]">
              Admin email
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              autoFocus
              required
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setError(null);
              }}
              placeholder="you@company.com"
              className="w-full rounded-[8px] border border-[#222222] bg-[#060606] px-3.5 py-3 text-[13px] text-[#fbfbfb] placeholder:text-[#6c6c6c] focus:border-[#2e2e2e] focus:outline-none"
            />

            <label htmlFor="login-password" className="text-[11px] text-[#919191]">
              Password
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setError(null);
              }}
              className="w-full rounded-[8px] border border-[#222222] bg-[#060606] px-3.5 py-3 text-[13px] text-[#fbfbfb] focus:border-[#2e2e2e] focus:outline-none"
            />

            {error ? <AuthNotice tone="error">{error}</AuthNotice> : null}

            <button
              type="submit"
              disabled={loading}
              aria-busy={loading}
              className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-[8px] bg-[#fbfbfb] py-3 text-[13px] font-bold text-black transition hover:bg-[#e8e8e8] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? <Spinner /> : null}
              {loading ? "Please wait…" : "Sign in"}
            </button>
          </form>
        </Reveal>

        <p className="mt-7 text-center text-[11px] leading-relaxed text-[#555]">
          Organization admins should use the password on each organization page.
        </p>
      </div>
    </main>
  );
}

function AuthNotice({
  tone,
  children,
}: {
  tone: "error" | "success";
  children: React.ReactNode;
}) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-[7px] border px-3 py-2 text-[11px] leading-relaxed ${
        tone === "error"
          ? "border-red-950 bg-red-950/20 text-[#e8b4b4]"
          : "border-emerald-950 bg-emerald-950/20 text-[#a7d7bd]"
      }`}
    >
      {children}
    </p>
  );
}

function safePath(value: string | null, fallback: string) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : fallback;
}

function callbackErrorMessage(error: string) {
  if (error === "admin_only") {
    return "Sign-in is limited to platform administrators. Use the organization admin password instead.";
  }
  if (error === "google_disabled") {
    return "Google sign-in is disabled. Use your admin email and password.";
  }
  return "The sign-in link could not be completed. Please try again.";
}

async function verifySuperAdminOrSignOut(supabase: ReturnType<typeof createClient>) {
  const response = await fetch("/api/me", {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.is_super_admin) {
    await supabase.auth.signOut();
    throw new Error("Sign-in is limited to platform administrators.");
  }
}
