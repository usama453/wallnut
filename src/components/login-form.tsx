"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { initialsFor } from "@/components/wallnut/avatar";
import { BackIcon, GoogleIcon, Spinner } from "@/components/wallnut/icons";
import { Reveal } from "@/components/wallnut/reveal";

type AuthMode = "signin" | "signup" | "magic";

export interface LoginOrganization {
  name: string;
  slug: string;
  accentColor: string;
}

export default function LoginForm({
  organization = null,
}: {
  organization?: LoginOrganization | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedMode = searchParams.get("mode");
  const initialMode: AuthMode =
    requestedMode === "signup" || requestedMode === "magic"
      ? requestedMode
      : "signin";
  const callbackError = searchParams.get("error");
  const redirectTo = safePath(
    searchParams.get("redirect"),
    organization ? `/${organization.slug}` : "/",
  );

  const [step, setStep] = useState<"email" | "credentials">("email");
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(
    callbackError ? callbackErrorMessage(callbackError) : null,
  );

  const workspaceLabel = organization?.name ?? "your private workspace";
  const callbackUrl =
    typeof window === "undefined"
      ? ""
      : buildCallbackUrl(window.location.origin, redirectTo, organization?.slug);

  function continueWithEmail(event: React.FormEvent) {
    event.preventDefault();
    if (!email.trim() || !email.includes("@")) {
      setError("Enter a valid work email.");
      return;
    }
    setError(null);
    setMessage(null);
    setStep("credentials");
  }

  async function handleGoogle() {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ next: redirectTo });
    if (organization?.slug) params.set("org", organization.slug);
    window.location.assign(`/api/auth/google?${params.toString()}`);
  }

  async function handleCredentials(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    const supabase = createClient();

    try {
      if (mode === "magic") {
        const { error: authError } = await supabase.auth.signInWithOtp({
          email: email.trim(),
          options: { emailRedirectTo: callbackUrl },
        });
        if (authError) throw authError;
        setMessage(`A secure sign-in link was sent to ${email.trim()}.`);
        return;
      }

      if (mode === "signup") {
        const { data, error: authError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: callbackUrl },
        });
        if (authError) throw authError;

        if (data.session) {
          await verifyOrganizationOrSignOut(supabase, organization?.slug);
          router.push(await destinationAfterAuth(organization?.slug, redirectTo));
          router.refresh();
        } else {
          setMessage(
            organization
              ? `Check ${email.trim()} to confirm your invited account for ${organization.name}.`
              : `Check ${email.trim()} to confirm your account.`,
          );
        }
        return;
      }

      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (authError) throw authError;
      await verifyOrganizationOrSignOut(supabase, organization?.slug);
      router.push(await destinationAfterAuth(organization?.slug, redirectTo));
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
        {organization ? "All organizations" : "Organizations"}
      </Link>

      <div className="w-full max-w-[360px]">
        <Reveal className="flex flex-col items-center" delayMs={60}>
          <div
            className="mb-4 flex size-11 items-center justify-center rounded-[10px] text-[14px] font-bold text-white"
            style={{ background: organization?.accentColor ?? "#3d5a80" }}
          >
            {organization ? initialsFor(organization.name) : "W"}
          </div>
          <h1 className="text-center text-[27px] font-bold leading-none tracking-[-0.72px] text-white">
            {mode === "signup" && !organization ? "Create workspace" : "Sign in"}
          </h1>
          <p className="mt-2.5 text-center text-[12px] text-[#919191]">
            {organization
              ? `Continue to ${organization.name}`
              : mode === "signup"
                ? "Start a private Wallnut workspace"
                : "Continue to Wallnut"}
          </p>
        </Reveal>

        {step === "email" ? (
          <Reveal delayMs={180}>
            <form onSubmit={continueWithEmail} className="mt-8 flex flex-col gap-3">
              <label htmlFor="login-email" className="text-[11px] text-[#919191]">
                Work email
              </label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setError(null);
                }}
                placeholder="you@company.com"
                className="w-full rounded-[8px] border border-[#111111] bg-[#060606] px-3.5 py-3 text-[13px] text-[#fbfbfb] placeholder:text-[#6c6c6c] focus:border-[#3a3a3a] focus:outline-none"
              />
              {error ? <AuthNotice tone="error">{error}</AuthNotice> : null}
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-[8px] bg-[#fbfbfb] py-3 text-[13px] font-bold text-black transition hover:bg-[#e8e8e8] disabled:opacity-70"
              >
                Continue with email
              </button>
            </form>

            <Divider />
            <GoogleButton loading={loading} onClick={handleGoogle} />
          </Reveal>
        ) : (
          <Reveal delayMs={40}>
            <form onSubmit={handleCredentials} className="mt-8">
              <button
                type="button"
                onClick={() => {
                  setStep("email");
                  setPassword("");
                  setError(null);
                  setMessage(null);
                }}
                className="mb-4 flex w-full items-center justify-between rounded-[8px] border border-[#111111] bg-[#060606] px-3.5 py-2.5 text-left"
              >
                <span className="truncate text-[12px] text-[#d0d0d0]">{email}</span>
                <span className="ml-3 text-[11px] text-[#6c6c6c]">Change</span>
              </button>

              <div className="mb-5 grid grid-cols-3 gap-1 rounded-[8px] bg-[#060606] p-1">
                {(
                  [
                    ["signin", "Sign in"],
                    ["signup", "Create"],
                    ["magic", "Magic link"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setMode(value);
                      setError(null);
                      setMessage(null);
                    }}
                    className={`rounded-[6px] px-2 py-2 text-[11px] transition ${
                      mode === value
                        ? "bg-[#262626] font-bold text-white"
                        : "text-[#6c6c6c] hover:text-[#bdbdbd]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {mode !== "magic" ? (
                <label className="block">
                  <span className="text-[11px] text-[#919191]">
                    {mode === "signup" ? "Password (minimum 6 characters)" : "Password"}
                  </span>
                  <input
                    type="password"
                    required
                    minLength={mode === "signup" ? 6 : undefined}
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    autoFocus
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value);
                      setError(null);
                    }}
                    className="mt-2 w-full rounded-[8px] border border-[#111111] bg-[#060606] px-3.5 py-3 text-[13px] text-[#fbfbfb] focus:border-[#3a3a3a] focus:outline-none"
                  />
                </label>
              ) : (
                <p className="rounded-[8px] border border-[#111111] bg-[#060606] px-3.5 py-3 text-[12px] leading-relaxed text-[#919191]">
                  We’ll email you a one-time sign-in link. No password required.
                </p>
              )}

              {mode === "signup" && organization ? (
                <p className="mt-3 text-[11px] leading-relaxed text-[#6c6c6c]">
                  Use the email address that was invited to {organization.name}.
                </p>
              ) : null}

              {error ? <AuthNotice tone="error">{error}</AuthNotice> : null}
              {message ? <AuthNotice tone="success">{message}</AuthNotice> : null}

              <button
                type="submit"
                disabled={loading || Boolean(message)}
                aria-busy={loading}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-[8px] bg-[#fbfbfb] py-3 text-[13px] font-bold text-black transition hover:bg-[#e8e8e8] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? <Spinner /> : null}
                {loading
                  ? "Please wait…"
                  : mode === "magic"
                    ? "Send magic link"
                    : mode === "signup"
                      ? organization
                        ? "Create invited account"
                        : "Create private workspace"
                      : "Sign in"}
              </button>
            </form>

            <Divider />
            <GoogleButton loading={loading} onClick={handleGoogle} />
          </Reveal>
        )}

        {organization ? (
          <p className="mt-7 text-center text-[11px] leading-relaxed text-[#555]">
            Access is limited to members invited to {workspaceLabel}.
          </p>
        ) : null}
      </div>
    </main>
  );
}

function Divider() {
  return (
    <div className="my-4 flex items-center gap-2.5">
      <span className="h-px flex-1 bg-[#0a0a0a]" />
      <span className="text-[11px] text-[#6c6c6c]">or</span>
      <span className="h-px flex-1 bg-[#0a0a0a]" />
    </div>
  );
}

function GoogleButton({
  loading,
  onClick,
}: {
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      aria-busy={loading}
      className="flex w-full items-center justify-center gap-2 rounded-[8px] border border-[#111111] bg-[#060606] py-3 text-[13px] font-bold text-[#fbfbfb] transition hover:bg-[#0a0a0a] disabled:cursor-progress disabled:opacity-50"
    >
      {loading ? <Spinner /> : <GoogleIcon />}
      {loading ? "Redirecting…" : "Continue with Google"}
    </button>
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
      className={`mt-3 rounded-[7px] border px-3 py-2 text-[11px] leading-relaxed ${
        tone === "error"
          ? "border-red-950 bg-red-950/20 text-[#e8b4b4]"
          : "border-emerald-950 bg-emerald-950/20 text-[#a7d7bd]"
      }`}
    >
      {children}
    </p>
  );
}

async function destinationAfterAuth(orgSlug: string | undefined, fallback: string) {
  if (orgSlug) return fallback.startsWith("/") ? fallback : `/${orgSlug}`;
  const response = await fetch("/api/me", {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  const body = await response.json().catch(() => null);
  const slug = body?.organization?.slug as string | undefined;
  return slug ? `/${slug}` : fallback;
}

function safePath(value: string | null, fallback: string) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : fallback;
}

function buildCallbackUrl(origin: string, next: string, org?: string) {
  const params = new URLSearchParams({ next });
  if (org) params.set("org", org);
  return `${origin}/auth/callback?${params.toString()}`;
}

function callbackErrorMessage(error: string) {
  if (error === "wrong_org") {
    return "This account does not have access to the selected organization.";
  }
  if (error === "profile_not_ready") {
    return "Your workspace membership is still being prepared. Try again in a moment.";
  }
  return "The sign-in link could not be completed. Please try again.";
}

async function verifyOrganizationOrSignOut(
  supabase: ReturnType<typeof createClient>,
  expectedSlug?: string,
) {
  if (!expectedSlug) return;

  const response = await fetch("/api/me", {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  const body = await response.json().catch(() => null);
  const actualSlug = body?.organization?.slug as string | undefined;

  if (!response.ok || !actualSlug) {
    await supabase.auth.signOut();
    throw new Error("Your workspace membership is not ready yet. Please try again.");
  }

  if (actualSlug !== expectedSlug) {
    const memberships = (body?.memberships ?? []) as Array<{ slug?: string }>;
    const allowed =
      expectedSlug === "public" ||
      expectedSlug === "default" ||
      memberships.some((membership) => membership.slug === expectedSlug);
    if (!allowed) {
      await supabase.auth.signOut();
      throw new Error("This account does not have access to the selected organization.");
    }
  }
}
