"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { orgHomePath, orgRankingsPath, isPublicOrgSlug } from "@/lib/org-paths";
import { TeamAccess } from "@/components/team-access";
import { InitialAvatar } from "./avatar";
import { Spinner } from "./icons";
import { NavigationProgress } from "./pending";
import { WhatsAppStatusWidget } from "./whatsapp-status-widget";

const SUPER_ADMIN_NAV = new Set(["Connect", "Upload", "Usage", "Settings"]);

export function AppHeader({
  authenticated = false,
  orgName,
  orgSlug,
  userName,
  userEmail,
  memberships = [],
  isSuperAdmin = false,
}: {
  authenticated?: boolean;
  orgName?: string | null;
  orgSlug?: string | null;
  userName?: string | null;
  userEmail?: string | null;
  memberships?: Array<{ name: string; slug: string; role?: string }>;
  isSuperAdmin?: boolean;
}) {
  const homeHref = orgSlug ? orgHomePath(orgSlug) : "/";
  const navItems = [
    { href: homeHref, label: "Overview" },
    { href: orgSlug ? orgRankingsPath(orgSlug) : "/stats", label: "Rankings" },
    { href: "/connect", label: "Connect" },
    { href: "/team", label: "Team" },
    { href: "/upload", label: "Upload" },
    { href: "/usage", label: "Usage" },
    { href: "/brand", label: "Brand profile" },
    { href: "/settings", label: "Settings" },
  ].filter((item) => isSuperAdmin || !SUPER_ADMIN_NAV.has(item.label));
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  async function logOut() {
    setLoggingOut(true);
    await createClient().auth.signOut();
    router.replace("/");
    router.refresh();
  }

  return (
    <header className="relative z-40 flex h-14 shrink-0 items-center justify-between bg-black/90 px-[22px] backdrop-blur-md">
      <NavigationProgress />
      <Link
        href="/"
        className="text-[12px] font-bold leading-none text-white transition-opacity hover:opacity-75"
      >
        Wallnut
      </Link>

      {!authenticated ? (
        <span className="text-[12px] text-[#6c6c6c]">Public</span>
      ) : (
        <div className="flex items-center gap-2.5">
          <WhatsAppStatusWidget canManage={isSuperAdmin} />
          {orgSlug && !isPublicOrgSlug(orgSlug) ? <TeamAccess orgSlug={orgSlug} /> : null}
          <div ref={menuRef} className="relative">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={open}
            aria-label="Open account and navigation menu"
            onClick={() => setOpen((value) => !value)}
            className="rounded-full transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
          >
            <span className="group/pfp relative inline-flex">
              <InitialAvatar label={userName || userEmail} size={28} />
              <span className="pointer-events-none absolute left-1/2 top-[calc(100%+8px)] z-50 -translate-x-1/2 whitespace-nowrap rounded-[6px] border border-[#111111] bg-[#0a0a0a] px-2 py-1 text-[10px] font-medium text-[#fbfbfb] opacity-0 shadow-[0_8px_20px_rgba(0,0,0,0.45)] transition group-hover/pfp:opacity-100">
                You
              </span>
            </span>
          </button>

          {open ? (
            <div
              role="menu"
              className="absolute right-0 top-[38px] w-[248px] overflow-hidden rounded-[10px] border border-[#111111] bg-[#060606] shadow-[0_24px_60px_rgba(0,0,0,0.7)] wallnut-reveal"
            >
              <div className="border-b border-[#111111] px-4 py-3">
                <p className="truncate text-[12px] font-bold text-[#fbfbfb]">
                  {userName || userEmail || "Account"}
                </p>
                {userName && userEmail ? (
                  <p className="mt-1 truncate text-[11px] text-[#6c6c6c]">{userEmail}</p>
                ) : null}
                <p className="mt-1 truncate text-[11px] text-[#919191]">{orgName}</p>
              </div>

              <nav className="grid grid-cols-2 gap-1 p-2" aria-label="Workspace">
                {navItems.map((item) => {
                  const active =
                    item.label === "Overview"
                      ? pathname === item.href
                      : pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.href}
                      role="menuitem"
                      href={item.href}
                      className={`rounded-[7px] px-3 py-2 text-[12px] transition ${
                        active
                          ? "bg-[#0d0d0d] font-bold text-white"
                          : "text-[#919191] hover:bg-[#0c0c0c] hover:text-white"
                      }`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </nav>

              <div className="border-t border-[#111111] p-2">
                <button
                  type="button"
                  role="menuitem"
                  disabled={loggingOut}
                  aria-busy={loggingOut}
                  onClick={logOut}
                  className="flex w-full items-center gap-2 rounded-[7px] px-3 py-2 text-left text-[12px] text-[#919191] transition hover:bg-[#0c0c0c] hover:text-white disabled:cursor-progress disabled:opacity-50"
                >
                  {loggingOut ? <Spinner /> : null}
                  {loggingOut ? "Logging out…" : "Log out"}
                </button>
              </div>
            </div>
          ) : null}
          </div>
        </div>
      )}
    </header>
  );
}
