"use client";

import { useEffect, useState } from "react";

export type Wamode = "meta" | "waha";

export function WhatsAppModeToggle() {
  const [mode, setMode] = useState<Wamode>("meta");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem("wallnut_wamode");
    if (saved === "meta" || saved === "waha") {
      setMode(saved);
    }
  }, []);

  const toggle = () => {
    const next = mode === "meta" ? "waha" : "meta";
    setMode(next);
    localStorage.setItem("wallnut_wamode", next);
    document.cookie = `wallnut_wamode=${next}; path=/; max-age=31536000; SameSite=Lax`;
  };

  if (!mounted) return null;

  return (
    <button
      onClick={toggle}
      className="inline-flex items-center gap-2 rounded-full bg-slate-800 px-3 py-1.5 text-xs font-medium hover:bg-slate-700 transition-colors"
    >
      <span className="text-slate-400">WhatsApp:</span>
      <span
        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
          mode === "meta" ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"
        }`}
      >
        {mode.toUpperCase()}
      </span>
    </button>
  );
}

export function getServerWamode(headers: Headers): Wamode {
  const cookie = headers.get("cookie") ?? "";
  const match = cookie.match(/wallnut_wamode=(meta|waha)/);
  return (match?.[1] as Wamode) ?? "meta";
}