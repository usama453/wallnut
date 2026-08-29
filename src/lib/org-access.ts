import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getPublicOrganization } from "@/lib/organizations";
import { isReservedOrgSlug, unwrapRelation } from "@/lib/org-paths";

export type OrgAccess =
  | { status: "reserved" }
  | { status: "unknown" }
  | { status: "unauthenticated"; slug: string }
  | { status: "forbidden"; slug: string; userOrgSlug: string | null }
  | {
      status: "ok";
      slug: string;
      user: { id: string; email?: string };
      org: { id: string; name: string; slug: string };
      profile: { full_name: string | null; role: string | null };
    };

export async function resolveOrgAccess(slug: string): Promise<OrgAccess> {
  if (isReservedOrgSlug(slug)) return { status: "reserved" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const published = await getPublicOrganization(slug);
    return published
      ? { status: "unauthenticated", slug }
      : { status: "unknown" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role, org_id, organizations(id, name, slug)")
    .eq("id", user.id)
    .maybeSingle();

  const organization = unwrapRelation<{ id: string; name: string; slug: string }>(
    profile?.organizations,
  );

  if (!organization?.slug || organization.slug !== slug) {
    return {
      status: "forbidden",
      slug,
      userOrgSlug: organization?.slug ?? null,
    };
  }

  return {
    status: "ok",
    slug,
    user: { id: user.id, email: user.email },
    org: organization,
    profile: {
      full_name: profile?.full_name ?? null,
      role: profile?.role ?? null,
    },
  };
}

export async function getAuthedOrgSlug() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("organizations(slug)")
    .eq("id", user.id)
    .maybeSingle();

  return unwrapRelation<{ slug: string }>(profile?.organizations)?.slug ?? null;
}
