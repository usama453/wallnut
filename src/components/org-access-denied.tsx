import Link from "next/link";
import { orgHomePath } from "@/lib/org-paths";
import { Reveal } from "@/components/wallnut/reveal";

export function OrgAccessDenied({
  orgName,
  userOrgSlug,
  userOrgName,
}: {
  orgName: string;
  userOrgSlug: string | null;
  userOrgName: string | null;
}) {
  return (
    <main className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4 py-14">
      <div className="w-full max-w-[420px]">
        <Reveal className="rounded-[12px] border border-[#1b1b1b] bg-[#101010] px-6 py-8 text-center">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#6c6c6c]">
            Access denied
          </p>
          <h1 className="mt-3 text-[24px] font-bold leading-tight tracking-[-0.5px] text-white">
            You do not have access to this org
          </h1>
          <p className="mt-3 text-[13px] leading-relaxed text-[#919191]">
            Your account is not invited to{" "}
            <span className="text-[#d0d0d0]">{orgName}</span>. Ask an admin to
            invite you, or switch to a workspace you belong to.
          </p>

          {userOrgSlug ? (
            <Link
              href={orgHomePath(userOrgSlug)}
              className="mt-6 inline-flex w-full items-center justify-center rounded-[8px] bg-[#fbfbfb] px-4 py-3 text-[13px] font-bold text-black transition hover:bg-[#e8e8e8]"
            >
              Go to {userOrgName ?? "your dashboard"}
            </Link>
          ) : (
            <Link
              href="/"
              className="mt-6 inline-flex w-full items-center justify-center rounded-[8px] bg-[#fbfbfb] px-4 py-3 text-[13px] font-bold text-black transition hover:bg-[#e8e8e8]"
            >
              Back to organizations
            </Link>
          )}
        </Reveal>
      </div>
    </main>
  );
}
