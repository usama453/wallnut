import { notFound, redirect } from "next/navigation";
import { DashboardGrid } from "@/components/dashboard-grid";
import { TeamManager } from "@/components/team-manager";
import { InitialAvatar } from "@/components/wallnut/avatar";
import { Reveal } from "@/components/wallnut/reveal";
import { getDashboardData } from "@/lib/groups";
import { resolveOrgAccess } from "@/lib/org-access";
import { canCreateWhatsAppGroup, isHiddenOrgMember, memberDisplayRole } from "@/lib/roles";
import { createAdminClient } from "@/lib/supabase/server";
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
    getDashboardData(access.org.id),
    getStats(access.org.id),
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
        pendingInvites={data.pendingInvites}
        canAddGroup={canCreateWhatsAppGroup(
          access.profile.role,
          access.isSuperAdmin,
        )}
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
        <TeamManager orgSlug={slug} />
      </div>
    </div>
  );
}

async function listOrgMembers(orgId: string) {
  const admin = await createAdminClient();
  const { data: memberships } = await admin
    .from("organizations_users")
    .select("user_id, role")
    .eq("org_id", orgId)
    .eq("status", "active");
  const userIds = [...new Set((memberships ?? []).map((row) => row.user_id).filter(Boolean))] as string[];
  if (userIds.length === 0) return [];

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, full_name")
    .in("id", userIds);
  const profileById = new Map(
    (profiles ?? []).map((profile) => [profile.id, profile]),
  );
  const roleById = new Map((memberships ?? []).map((row) => [row.user_id, row.role]));

  const emails = await Promise.all(
    userIds.map(async (id) => {
      const { data } = await admin.auth.admin.getUserById(id);
      return [id, data.user?.email ?? ""] as const;
    }),
  );
  const emailById = new Map(emails);

  return userIds
    .filter((id) => !isHiddenOrgMember(emailById.get(id)))
    .map((id) => {
      const profile = profileById.get(id);
      return {
        id,
        full_name: profile?.full_name ?? null,
        role: memberDisplayRole(roleById.get(id), emailById.get(id)),
      };
    })
    .sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));
}
