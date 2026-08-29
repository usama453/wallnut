import { notFound, redirect } from "next/navigation";
import { Rankings } from "@/components/rankings";
import { resolveOrgAccess } from "@/lib/org-access";
import { getStats } from "@/lib/stats";

export const dynamic = "force-dynamic";

export default async function OrgRankingsPage({
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

  const stats = await getStats(access.org.id);
  if (!stats) notFound();

  return (
    <Rankings
      orgName={stats.orgName}
      orgSlug={slug}
      byTypos={stats.byTypos}
      byUploads={stats.byUploads}
      totals={stats.totals}
    />
  );
}
