import { notFound, redirect } from "next/navigation";
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
  if (access.status === "unauthenticated") {
    redirect(orgLoginPath(slug, orgHomePath(slug)));
  }
  if (access.status === "forbidden") {
    if (access.userOrgSlug) redirect(orgHomePath(access.userOrgSlug));
    redirect(`${orgLoginPath(slug, orgHomePath(slug))}&error=wrong_org`);
  }

  return (
    <div className="min-h-screen bg-black text-[#fbfbfb]">
      <AppHeader
        authenticated
        orgName={access.org.name}
        orgSlug={access.org.slug}
        userName={access.profile.full_name}
        userEmail={access.user.email}
      />
      <main className="min-h-[calc(100vh-3.5rem)] px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
