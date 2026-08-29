import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { TeamManager } from "@/components/team-manager";
import { Reveal } from "@/components/wallnut/reveal";
import { PendingLink } from "@/components/wallnut/pending";
import { orgHomePath } from "@/lib/org-paths";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role, organizations(name, slug)")
    .eq("id", user?.id ?? "")
    .maybeSingle();

  const organization = Array.isArray(profile?.organizations)
    ? (profile.organizations[0] as { name?: string; slug?: string } | undefined)
    : (profile?.organizations as { name?: string; slug?: string } | null | undefined);
  const orgName = organization?.name ?? "My workspace";
  const orgSlug = organization?.slug ?? null;

  return (
    <section className="mx-auto w-full max-w-2xl pb-8 pt-2">
      <Reveal dramatic>
        <header>
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#6c6c6c]">
            Workspace
          </p>
          <h1 className="mt-2 text-[clamp(26px,4vw,34px)] font-bold leading-tight tracking-[-0.8px] text-white">
            Team
          </h1>
          <p className="mt-3 max-w-xl text-[13px] leading-relaxed text-[#919191]">
            Manage who has access to <span className="text-[#bdbdbd]">{orgName}</span>.
            Everyone in this workspace sees the same reports.
          </p>
        </header>
      </Reveal>

      <Reveal dramatic delayMs={120} className="mt-8">
        <TeamManager orgSlug={orgSlug ?? undefined} />
      </Reveal>

      <Reveal dramatic delayMs={200}>
        <p className="mt-6 text-[11px] leading-relaxed text-[#5f5f5f]">
          Report links sent via WhatsApp remain viewable by anyone with the link.
        </p>
        {orgSlug ? (
          <PendingLink
            href={orgHomePath(orgSlug)}
            pendingLabel="Loading…"
            className="mt-4 inline-block text-[12px] text-[#919191] transition hover:text-white"
          >
            ← Back to workspace
          </PendingLink>
        ) : (
          <Link
            href="/"
            className="mt-4 inline-block text-[12px] text-[#919191] transition hover:text-white"
          >
            ← Back to organizations
          </Link>
        )}
      </Reveal>
    </section>
  );
}
