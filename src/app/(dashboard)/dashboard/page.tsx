import { redirect } from "next/navigation";
import { getAuthedOrgSlug } from "@/lib/org-access";
import { orgHomePath } from "@/lib/org-paths";

export default async function LegacyDashboardPage() {
  const slug = await getAuthedOrgSlug();
  redirect(slug ? orgHomePath(slug) : "/");
}
