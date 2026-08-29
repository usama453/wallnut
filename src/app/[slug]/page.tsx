import { notFound, redirect } from "next/navigation";
import { DashboardGrid } from "@/components/dashboard-grid";
import { TeamManager } from "@/components/team-manager";
import { InitialAvatar } from "@/components/wallnut/avatar";
import { Reveal } from "@/components/wallnut/reveal";
import { WhatsAppGroups } from "@/components/whatsapp-groups";
import { getDashboardData } from "@/lib/groups";
import { resolveOrgAccess } from "@/lib/org-access";
import { createClient } from "@/lib/supabase/server";
import { getStats } from "@/lib/stats";

export const dynamic = "force-dynamic";

export default async function OrganizationHome({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const access = await resolveOrgAccess(slug);
  if (access.status !== "ok") {
    if (access.status === "reserved" || access.status === "unknown") notFound();
    redirect("/");
  }

  const [data, rankings, members] = await Promise.all([
    getDashboardData(),
    getStats(),
    listOrgMembers(access.org.id),
  ]);
  if (!data || !rankings || data.orgSlug !== slug) notFound();

  return (
    <div className="mx-auto max-w-5xl">
      <DashboardGrid
        orgName={data.orgName}
        orgSlug={slug}
        cards={data.cards}
        stats={data.stats}
        leaders={rankings.byTypos}
      />

      <Reveal className="mx-auto mt-16 max-w-[720px]" delayMs={80}>
        <section>
          <h2 className="text-[12px] font-bold text-[#fbfbfb]">People</h2>
          <p className="mt-1 text-[12px] text-[#6c6c6c]">
            Everyone in this workspace can see its groups and reports.
          </p>
          {members.length > 0 ? (
            <ul className="mt-4 divide-y divide-[#1b1b1b] overflow-hidden rounded-[10px] border border-[#1b1b1b] bg-[#101010]">
              {members.map((member) => (
                <li
                  key={member.id}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <InitialAvatar label={member.full_name} size={28} />
                    <span className="min-w-0">
                      <span className="block truncate text-[12px] font-bold text-[#fbfbfb]">
                        {member.full_name || "Workspace member"}
                      </span>
                      <span className="block text-[11px] capitalize text-[#6c6c6c]">
                        {member.role ?? "member"}
                      </span>
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-[12px] text-[#6c6c6c]">No members yet.</p>
          )}
        </section>
      </Reveal>

      <div className="mx-auto mt-10 max-w-[720px]">
        <TeamManager />
      </div>

      <div className="mx-auto mt-16 max-w-[720px] border-t border-[#1b1b1b] pt-8">
        <WhatsAppGroups codes={data.codes} />
      </div>
    </div>
  );
}

async function listOrgMembers(orgId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .eq("org_id", orgId)
    .order("full_name");
  return data ?? [];
}
