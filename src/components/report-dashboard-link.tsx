"use client";

import Link from "next/link";
import { orgHomePath } from "@/lib/org-paths";

export function ReportDashboardLink({
  orgName,
  orgSlug,
}: {
  orgName: string;
  orgSlug: string;
}) {
  return (
    <div className="mt-6 flex justify-center">
      <Link
        href={orgHomePath(orgSlug)}
        className="inline-flex items-center justify-center rounded-[8px] border border-[#1a1a1a] bg-[#060606] px-4 py-2.5 text-[12px] font-bold text-[#fbfbfb] transition hover:bg-[#0a0a0a]"
      >
        Open {orgName} workspace
      </Link>
    </div>
  );
}
