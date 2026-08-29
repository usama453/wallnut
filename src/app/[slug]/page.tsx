import { notFound, redirect } from "next/navigation";
import { DashboardGrid } from "@/components/dashboard-grid";
import { TeamManager } from "@/components/team-manager";
import { getDashboardData } from "@/lib/groups";
import { resolveOrgAccess } from "@/lib/org-access";
import { canCreateWhatsAppGroup } from "@/lib/roles";
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

  const [data, rankings] = await Promise.all([
    getDashboardData(access.org.id),
    getStats(access.org.id),
  ]);
  if (!data || !rankings || data.orgSlug !== slug) notFound();

  return (
    <div className="mx-auto max-w-5xl">
      <DashboardGrid
        orgName={data.orgName}
        orgSlug={slug}
        cards={data.cards}
        stats={{ ...data.stats, members: rankings.totals.people }}
        leaders={rankings.byTypos}
        pendingInvites={data.pendingInvites}
        canAddGroup={canCreateWhatsAppGroup(
          access.profile.role,
          access.isSuperAdmin,
        )}
      />

      <div className="mx-auto mt-10 flex w-full max-w-[680px] flex-col">
        <TeamManager orgSlug={slug} />
      </div>
    </div>
  );
}
