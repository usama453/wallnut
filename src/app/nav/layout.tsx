import type { Metadata } from "next";
import { Sidebar } from "@/components/navigator/sidebar";

export const metadata: Metadata = {
  title: "Sales Navigator",
  description:
    "Understand where a deal stands, what's blocking it, and the single best next action to move it toward a close.",
};

export default function NavigatorLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="flex">
        <Sidebar />
        <main className="thin-scroll min-h-screen flex-1 overflow-y-auto">
          <div className="mx-auto max-w-5xl px-8 py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}