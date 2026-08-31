"use client";

import Link from "next/link";
import { orgHomePath } from "@/lib/org-paths";

export function ReportDashboardLink({
  orgName,
  orgSlug,
  className = "",
}: {
  orgName: string;
  orgSlug: string;
  className?: string;
}) {
  return (
    <Link
      href={orgHomePath(orgSlug)}
      className={`inline-flex items-center gap-2 text-[12px] font-bold text-[#fbfbfb] transition hover:text-white ${className}`}
    >
      <BackArrow />
      {orgName} Workspace
    </Link>
  );
}

function BackArrow() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden
      className="shrink-0"
    >
      <path
        d="M8.5 2.5 4 7l4.5 4.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
