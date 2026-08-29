import { redirect } from "next/navigation";
import { getAuthedOrgSlug } from "@/lib/org-access";
import { orgRankingsPath } from "@/lib/org-paths";

export default async function LegacyStatsPage() {
  const slug = await getAuthedOrgSlug();
  redirect(slug ? orgRankingsPath(slug) : "/");
}
