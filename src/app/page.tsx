import Link from "next/link";
import { AppHeader } from "@/components/wallnut/app-header";
import { avatarPalette } from "@/components/wallnut/avatar";
import { EnterIcon } from "@/components/wallnut/icons";
import { Reveal } from "@/components/wallnut/reveal";
import {
  getPublicOrganizations,
  type PublicOrganization,
} from "@/lib/organizations";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const organizations = await getPublicOrganizations();

  return (
    <div className="flex min-h-screen flex-col bg-black">
      <AppHeader />
      <main className="flex min-h-[calc(100vh-3.5rem)] flex-1 flex-col items-center justify-center px-4 py-12">
        <Reveal>
          <h1 className="text-center text-[27px] font-bold leading-none tracking-[-0.72px] text-white">
            Organizations
          </h1>
        </Reveal>
        <Reveal delayMs={80}>
          <div className="mt-3 flex items-center gap-4 text-[13px] text-[#919191]">
            <span>
              {organizations.length} public organization
              {organizations.length === 1 ? "" : "s"}
            </span>
            <span>Sign in to continue</span>
          </div>
        </Reveal>

        <Reveal className="mt-12 w-full max-w-[640px]" delayMs={180}>
          {organizations.length > 0 ? (
            <div className="flex flex-col gap-4">
              {organizations.map((org) => (
                <OrganizationCard key={org.id} org={org} />
              ))}
            </div>
          ) : (
            <div className="rounded-[12px] border border-dashed border-[#111111] px-6 py-14 text-center">
              <p className="text-[13px] font-bold text-[#d0d0d0]">
                No public organizations yet
              </p>
              <p className="mt-2 text-[12px] text-[#6c6c6c]">
                Ask your workspace owner for an invite, or create a private workspace.
              </p>
            </div>
          )}
        </Reveal>

        <Reveal delayMs={260}>
          <p className="mt-8 text-center text-[12px] text-[#6c6c6c]">
            Starting something new?{" "}
            <Link
              href="/login?mode=signup"
              className="text-[#bdbdbd] transition hover:text-white"
            >
              Create a private workspace
            </Link>
          </p>
        </Reveal>
      </main>
    </div>
  );
}

function OrganizationCard({ org }: { org: PublicOrganization }) {
  return (
    <Link
      href={`/${encodeURIComponent(org.slug)}`}
      className="group relative w-full overflow-hidden rounded-[12px] border border-[#111111] bg-[#060606] px-5 py-6 text-left shadow-[0_16px_24px_rgba(0,0,0,0.35)] transition-colors hover:border-[#1a1a1a] sm:px-7 sm:py-7"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: "linear-gradient(90deg, #242424 0%, #0a0a0a 100%)" }}
      />
      <span className="relative block pr-8 text-[clamp(25px,5vw,34px)] font-bold italic leading-[1.05] tracking-[-1.2px] text-[#fbfbfb]">
        {org.name}
      </span>
      {org.tagline ? (
        <span className="relative mt-2 block text-[12px] text-[#6c6c6c]">
          {org.tagline}
        </span>
      ) : null}

      <span className="relative mt-6 flex items-center justify-between gap-3">
        <AnonymousFaceStack org={org} />
        <span className="shrink-0 text-right text-[12px] leading-[1.3] text-[#6c6c6c]">
          {org.members} member{org.members === 1 ? "" : "s"}
          {org.lastActive ? ` · ${formatLastActive(org.lastActive)}` : ""}
        </span>
      </span>

      <span className="absolute right-7 top-7 z-10 text-[#6c6c6c] opacity-0 transition group-hover:text-[#fbfbfb] group-hover:opacity-100">
        <EnterIcon />
      </span>
    </Link>
  );
}

function AnonymousFaceStack({ org }: { org: PublicOrganization }) {
  const count = Math.min(Math.max(org.members, 1), 4);
  return (
    <span className="flex items-center" aria-label={`${org.members} members`}>
      {Array.from({ length: count }, (_, index) => {
        const color = avatarPalette(`${org.slug}-${index}`);
        return (
          <span
            key={index}
            aria-hidden
            className="size-[22px] rounded-full ring-2 ring-[#060606]"
            style={{
              marginLeft: index === 0 ? 0 : -4,
              zIndex: count - index,
              background: color.background,
            }}
          />
        );
      })}
      {org.members > count ? (
        <span className="ml-2 text-[12px] text-[#6c6c6c]">+{org.members - count}</span>
      ) : null}
    </span>
  );
}

function formatLastActive(value: string) {
  const elapsed = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.floor(elapsed / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
