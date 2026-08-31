import { redirect } from "next/navigation";
import { orgHomePath } from "@/lib/org-paths";

export default async function OrganizationLoginRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const url = new URL("/login", "https://wallnut.local");
  url.searchParams.set("redirect", orgHomePath(slug));
  const error = query.error;
  if (typeof error === "string") url.searchParams.set("error", error);
  redirect(`${url.pathname}${url.search}`);
}
