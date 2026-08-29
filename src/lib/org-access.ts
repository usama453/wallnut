import "server-only";

import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  activateOrgForUser,
  getOrgBySlug,
  listUserMemberships,
  userCanAccessOrg,
} from "@/lib/org-membership";
import { getPublicOrganization } from "@/lib/organizations";
import { isReservedOrgSlug, orgHomePath, orgLoginPath } from "@/lib/org-paths";
import { userIsSuperAdmin } from "@/lib/roles";

export type OrgAccess =
  | { status: "reserved" }
  | { status: "unknown" }
  | { status: "unauthenticated"; slug: string }
  | {
      status: "forbidden";
      slug: string;
      orgName: string;
      userOrgSlug: string | null;
      user: { email?: string };
      profile: { full_name: string | null };
      isSuperAdmin: boolean;
      memberships: Array<{ name: string; slug: string; role: string }>;
    }
  | {
      status: "ok";
      slug: string;
      user: { id: string; email?: string };
      org: { id: string; name: string; slug: string };
      profile: { full_name: string | null; role: string | null };
      isSuperAdmin: boolean;
      memberships: Array<{ name: string; slug: string; role: string }>;
    };

export async function resolveOrgAccess(slug: string): Promise<OrgAccess> {
  if (isReservedOrgSlug(slug)) return { status: "reserved" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const org = await getOrgBySlug(slug);

  if (!user) {
    if (org) return { status: "unauthenticated", slug: org.slug };
    const published = await getPublicOrganization(slug);
    return published ? { status: "unauthenticated", slug } : { status: "unknown" };
  }

  if (!org) return { status: "unknown" };

  const memberships = await listUserMemberships(user.id);
  const isSuperAdmin = await userIsSuperAdmin(user.id, user.email);
  const allowed = isSuperAdmin || (await userCanAccessOrg(user.id, org.slug));
  if (!allowed) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();

    return {
      status: "forbidden",
      slug: org.slug,
      orgName: org.name,
      userOrgSlug: memberships.find((membership) => membership.isPublic)?.slug
        ?? memberships[0]?.slug
        ?? null,
      user: { email: user.email },
      profile: { full_name: profile?.full_name ?? null },
      isSuperAdmin,
      memberships: memberships.map((membership) => ({
        name: membership.name,
        slug: membership.slug,
        role: membership.role,
      })),
    };
  }

  await activateOrgForUser(user.id, org.id);

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .maybeSingle();
  const role =
    memberships.find((membership) => membership.orgId === org.id)?.role
    ?? profile?.role
    ?? "member";

  return {
    status: "ok",
    slug: org.slug,
    user: { id: user.id, email: user.email },
    org: { id: org.id, name: org.name, slug: org.slug },
    profile: {
      full_name: profile?.full_name ?? null,
      role,
    },
    isSuperAdmin,
    memberships: memberships.map((membership) => ({
      name: membership.name,
      slug: membership.slug,
      role: membership.role,
    })),
  };
}

export function requireOrgPageAccess(
  access: OrgAccess,
): access is Extract<OrgAccess, { status: "ok" }> {
  if (access.status === "reserved" || access.status === "unknown") notFound();
  if (access.status === "unauthenticated") {
    redirect(orgLoginPath(access.slug, orgHomePath(access.slug)));
  }
  if (access.status === "forbidden") return false;
  return true;
}

export async function getAuthedOrgSlug() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const memberships = await listUserMemberships(user.id);
  return (
    memberships.find((membership) => membership.isPublic)?.slug
    ?? memberships[0]?.slug
    ?? null
  );
}
