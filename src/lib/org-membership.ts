import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import {
  LEGACY_PUBLIC_ORG_SLUG,
  ORG_COOKIE,
  PUBLIC_ORG_SLUG,
  isPublicOrgSlug,
} from "@/lib/org-paths";
import { userIsSuperAdmin } from "@/lib/roles";

export interface OrgRecord {
  id: string;
  name: string;
  slug: string;
  isPublic: boolean;
}

export interface OrgMembership {
  orgId: string;
  name: string;
  slug: string;
  role: string;
  isPublic: boolean;
}

export async function getPublicOrgRecord(): Promise<OrgRecord | null> {
  const admin = await createAdminClient();
  const { data } = await admin
    .from("organizations")
    .select("id, name, slug, is_public")
    .in("slug", [PUBLIC_ORG_SLUG, LEGACY_PUBLIC_ORG_SLUG])
    .order("slug", { ascending: false })
    .limit(1);
  const row = data?.[0];
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    isPublic: true,
  };
}

export const getOrgBySlug = cache(async function getOrgBySlug(
  slug: string,
): Promise<OrgRecord | null> {
  if (isPublicOrgSlug(slug)) return getPublicOrgRecord();
  const admin = await createAdminClient();
  const { data } = await admin
    .from("organizations")
    .select("id, name, slug, is_public")
    .eq("slug", slug)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    name: data.name,
    slug: data.slug,
    isPublic: Boolean(data.is_public) || isPublicOrgSlug(data.slug),
  };
});

export const listUserMemberships = cache(async function listUserMemberships(
  userId: string,
): Promise<OrgMembership[]> {
  const admin = await createAdminClient();
  const superAdmin = await userIsSuperAdmin(userId);
  const publicOrg = await getPublicOrgRecord();
  const [{ data: profile }, { data: rows }, allOrgs] = await Promise.all([
    admin.from("profiles").select("org_id, role").eq("id", userId).maybeSingle(),
    admin
      .from("organizations_users")
      .select("org_id, role")
      .eq("user_id", userId)
      .eq("status", "active"),
    superAdmin
      ? admin.from("organizations").select("id, name, slug")
      : Promise.resolve({ data: null }),
  ]);

  const ids = new Set<string>();
  if (publicOrg) ids.add(publicOrg.id);
  if (profile?.org_id) ids.add(profile.org_id);
  for (const row of rows ?? []) ids.add(row.org_id);
  for (const org of allOrgs.data ?? []) ids.add(org.id);
  if (ids.size === 0) return [];

  const { data: orgs } = await admin
    .from("organizations")
    .select("id, name, slug")
    .in("id", [...ids]);

  const roleByOrg = new Map<string, string>();
  if (profile?.org_id) roleByOrg.set(profile.org_id, profile.role ?? "member");
  for (const row of rows ?? []) roleByOrg.set(row.org_id, row.role);
  if (publicOrg && !roleByOrg.has(publicOrg.id)) {
    roleByOrg.set(publicOrg.id, superAdmin ? "super_admin" : "member");
  }
  if (superAdmin) {
    for (const org of orgs ?? []) {
      if (!roleByOrg.has(org.id)) roleByOrg.set(org.id, "super_admin");
    }
  }

  return (orgs ?? [])
    .map((org) => ({
      orgId: org.id,
      name: org.name,
      slug: org.slug,
      role: roleByOrg.get(org.id) ?? "member",
      isPublic: isPublicOrgSlug(org.slug),
    }))
    .sort(
      (a, b) =>
        Number(b.isPublic) - Number(a.isPublic) || a.name.localeCompare(b.name),
    );
});

export async function userCanAccessOrg(userId: string, slug: string) {
  if (isPublicOrgSlug(slug)) return true;
  if (await userIsSuperAdmin(userId)) return true;
  const memberships = await listUserMemberships(userId);
  return memberships.some((membership) => membership.slug === slug);
}

export async function activateOrgForUser(userId: string, orgId: string) {
  const admin = await createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("org_id")
    .eq("id", userId)
    .maybeSingle();
  if (profile?.org_id === orgId) return;
  await admin.from("profiles").update({ org_id: orgId }).eq("id", userId);
}

export async function requireOrgContext(requestedSlug?: string | null): Promise<
  | {
      error: NextResponse;
    }
  | {
      error?: undefined;
      userId: string;
      orgId: string;
      role: string;
      isSuperAdmin: boolean;
      org: OrgRecord;
      memberships: OrgMembership[];
    }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  }

  const cookieStore = await cookies();
  const slug =
    requestedSlug?.trim() ||
    cookieStore.get(ORG_COOKIE)?.value ||
    PUBLIC_ORG_SLUG;
  const org = await getOrgBySlug(slug);
  if (!org) {
    return { error: NextResponse.json({ error: "No organization" }, { status: 400 }) };
  }
  if (!(await userCanAccessOrg(user.id, org.slug))) {
    return {
      error: NextResponse.json(
        { error: "This account does not have access to that organization" },
        { status: 403 },
      ),
    };
  }

  const memberships = await listUserMemberships(user.id);
  const isSuperAdmin = await userIsSuperAdmin(user.id, user.email);
  const role =
    memberships.find((membership) => membership.orgId === org.id)?.role ?? "member";
  await activateOrgForUser(user.id, org.id);
  return { userId: user.id, orgId: org.id, role, isSuperAdmin, org, memberships };
}
