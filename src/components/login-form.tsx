"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") ?? "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "magic">("signin");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    const supabase = createClient();
    try {
      if (mode === "magic") {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: `${location.origin}/auth/callback` },
        });
        if (error) throw error;
        setMessage("Check your inbox for the magic link.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        router.push(redirectTo);
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <span className="mx-auto grid size-10 place-items-center rounded-lg bg-indigo-500 font-bold text-white">
            A
          </span>
          <h1 className="mt-3 text-xl font-semibold">Welcome to AI Proof</h1>
          <p className="text-sm text-slate-400">Quality gate for marketing assets</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/50 p-6"
        >
          <div className="mb-3 flex gap-1 rounded-lg bg-slate-800/60 p-1 text-xs">
            <button
              type="button"
              onClick={() => setMode("signin")}
              className={`flex-1 rounded-md px-2 py-1.5 ${
                mode === "signin" ? "bg-slate-700 font-medium" : "text-slate-400"
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => setMode("magic")}
              className={`flex-1 rounded-md px-2 py-1.5 ${
                mode === "magic" ? "bg-slate-700 font-medium" : "text-slate-400"
              }`}
            >
              Magic link
            </button>
          </div>

          <label className="block">
            <span className="text-xs text-slate-400">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-indigo-500"
            />
          </label>

          {mode === "signin" && (
            <label className="block">
              <span className="text-xs text-slate-400">Password</span>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-indigo-500"
              />
            </label>
          )}

          {error && <p className="text-xs text-red-400">{error}</p>}
          {message && <p className="text-xs text-emerald-400">{message}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-indigo-500 py-2 text-sm font-semibold hover:bg-indigo-400 disabled:opacity-50"
          >
            {loading ? "Please wait…" : mode === "magic" ? "Send magic link" : "Sign in"}
          </button>

          {mode === "signin" && (
            <p className="pt-1 text-center text-xs text-slate-500">
              New here?{" "}
              <span className="text-slate-600">
                create an account in your Supabase dashboard (Authentication → Users)
              </span>
            </p>
          )}
        </form>
      </div>
    </main>
  );
}
