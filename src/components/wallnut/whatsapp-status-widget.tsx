"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

export function WhatsAppStatusWidget({
  canManage = false,
  initialStatus,
}: {
  canManage?: boolean;
  initialStatus?: string;
}) {
  const [status, setStatus] = useState<string | null>(initialStatus ?? null);

  const refresh = useCallback(async () => {
    if (!canManage) return;
    try {
      const response = await fetch("/api/whatsapp/session", { cache: "no-store" });
      const data = await response.json();
      setStatus(typeof data.status === "string" ? data.status : null);
    } catch {
      setStatus(null);
    }
  }, [canManage]);

  useEffect(() => {
    if (!canManage) {
      setStatus(initialStatus ?? null);
      return;
    }
    void refresh();
    const delay = status === "WORKING" ? 30_000 : 10_000;
    const timer = window.setInterval(() => void refresh(), delay);
    return () => window.clearInterval(timer);
  }, [canManage, initialStatus, refresh, status]);

  const online = status === "WORKING";
  const label = online ? "Online" : "Offline";
  const title = online
    ? "WhatsApp is online and ready"
    : "WhatsApp is offline";

  const className =
    "inline-flex items-center gap-1.5 rounded-full border border-[#222222] px-2.5 py-1 text-[10px] font-medium leading-none text-[#919191]";

  const content = (
    <>
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${online ? "bg-emerald-400" : "bg-zinc-500"}`}
        aria-hidden
      />
      {label}
    </>
  );

  if (canManage) {
    return (
      <Link
        href="/connect"
        title={title}
        aria-label={`WhatsApp status: ${label}. Open Connect.`}
        className={`${className} transition hover:border-white/20 hover:text-white`}
      >
        {content}
      </Link>
    );
  }

  return (
    <span title={title} aria-label={`WhatsApp status: ${label}`} className={className}>
      {content}
    </span>
  );
}
