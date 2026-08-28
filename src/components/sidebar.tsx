"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/dashboard", label: "Overview", icon: "⌂" },
  { href: "/upload", label: "Upload", icon: "↑" },
  { href: "/connect", label: "Connect", icon: "✆" },
  { href: "/stats", label: "Stats", icon: "≣" },
  { href: "/usage", label: "Usage", icon: "▤" },
  { href: "/brand", label: "Brand profile", icon: "◧" },
  { href: "/team", label: "Team", icon: "☰" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-56 flex-col border-r border-slate-800 bg-slate-950/60 px-3 py-4">
      <div className="flex items-center gap-2 px-2">
        <span className="grid size-7 place-items-center rounded-md bg-zinc-100 text-sm font-bold text-black">
          W
        </span>
        <span className="font-semibold text-zinc-100">Wallnut</span>
      </div>

      <nav className="mt-6 flex-1 space-y-1 text-sm">
        {NAV.map((item) => {
          const active =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 ${
                active
                  ? "bg-zinc-900 font-medium text-white"
                  : "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200"
              }`}
            >
              <span className="w-4 text-center">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto space-y-1 text-sm">
        <Link
          href="/settings"
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200"
        >
          <span className="w-4 text-center">⚙</span>
          Settings
        </Link>
      </div>
    </aside>
  );
}
