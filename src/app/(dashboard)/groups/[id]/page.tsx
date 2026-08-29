import { redirect } from "next/navigation";
import { getAuthedOrgSlug } from "@/lib/org-access";
import { orgGroupPath } from "@/lib/org-paths";

export default async function LegacyGroupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const slug = await getAuthedOrgSlug();
  redirect(slug ? orgGroupPath(slug, id) : "/");
}
