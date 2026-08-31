import { notFound, redirect } from "next/navigation";
import { DashboardAccessForm } from "@/components/dashboard-access-form";
import { OrgAccessDenied } from "@/components/org-access-denied";
import { AppHeader } from "@/components/wallnut/app-header";
import { resolveOrgAccess } from "@/lib/org-access";
import { orgHomePath, orgLoginPath } from "@/lib/org-paths";

export default async function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const access = await resolveOrgAccess(slug);

  if (access.status === "reserved" || access.status === "unknown") notFound();
  if (access.status === "password_required") {
    return (
      <div className="min-h-screen bg-black text-[#fbfbfb]">
        <AppHeader />
        <DashboardAccessForm orgSlug={access.slug} orgName={access.orgName} />
      </div>
    );
  }
  if (access.status === "unauthenticated") {
    redirect(orgLoginPath(slug, orgHomePath(slug)));
  }
  if (access.status === "forbidden") {
    const homeMembership =
      access.memberships.find((membership) => membership.slug === access.userOrgSlug)
      ?? null;

    return (
      <div className="min-h-screen bg-black text-[#fbfbfb]">
        <AppHeader
          authenticated
          orgName={homeMembership?.name ?? null}
          orgSlug={access.userOrgSlug}
          userName={access.profile.full_name}
          userEmail={access.user.email}
          memberships={access.memberships}
          isSuperAdmin={access.isSuperAdmin}
        />
        <OrgAccessDenied
          orgName={access.orgName}
          userOrgSlug={access.userOrgSlug}
          userOrgName={homeMembership?.name ?? null}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-[#fbfbfb]">
        <AppHeader
          authenticated
          orgName={access.org.name}
          orgSlug={access.org.slug}
          userName={access.profile.full_name}
          userEmail={access.user.email}
          memberships={access.memberships}
          isSuperAdmin={access.isSuperAdmin}
          isGuest={access.isGuest}
        />
      <main className="min-h-[calc(100vh-3.5rem)] px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
