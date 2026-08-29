import { notFound } from "next/navigation";
import { DashboardGrid } from "@/components/dashboard-grid";
import { PublicDashboard } from "@/components/public-dashboard";
import { getDashboardData } from "@/lib/groups";
import { requireOrgPageAccess, resolveOrgAccess } from "@/lib/org-access";
import { isPublicOrgSlug } from "@/lib/org-paths";
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
  if (!requireOrgPageAccess(access)) return null;

  const isPublic = isPublicOrgSlug(slug);
  const [data, rankings] = await Promise.all([
    getDashboardData(access.org.id),
    isPublic ? Promise.resolve(null) : getStats(access.org.id),
  ]);
  if (!data || data.orgSlug !== slug) notFound();
  if (!isPublic && !rankings) notFound();

  if (isPublic) {
    return (
      <PublicDashboard
        orgSlug={slug}
        cards={data.cards}
        stats={data.stats}
        pendingInvites={data.pendingInvites}
        canManageGroups={access.isSuperAdmin}
      />
    );
  }

  if (!rankings) notFound();

  const canAddGroup = canCreateWhatsAppGroup(
    access.profile.role,
    access.isSuperAdmin,
  );

  return (
    <div className="mx-auto max-w-5xl">
      <DashboardGrid
        orgName={data.orgName}
        orgSlug={slug}
        cards={data.cards}
        stats={{ ...data.stats, members: rankings.totals.people }}
        leaders={rankings.byTypos}
        pendingInvites={data.pendingInvites}
        canAddGroup={canAddGroup}
      />

    </div>
  );
}
