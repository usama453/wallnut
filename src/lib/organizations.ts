import "server-only";

import { createAdminClient } from "@/lib/supabase/server";

export interface PublicOrganization {
  id: string;
  name: string;
  slug: string;
  tagline: string | null;
  accentColor: string;
  members: number;
  groups: number;
  reports: number;
  lastActive: string | null;
}

type OrganizationRow = {
  id: string;
  name: string;
  slug: string;
  tagline?: string | null;
  accent_color?: string | null;
};

export async function getPublicOrganizations(): Promise<PublicOrganization[]> {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return [];
  }

  const admin = await createAdminClient();
  const published = await admin
    .from("organizations")
    .select("id, name, slug, tagline, accent_color")
    .eq("is_public", true)
    .order("name");

  // Keep the page usable before migration 0021 is applied, but never fall back
  // to listing every private workspace.
  const rows: OrganizationRow[] = published.error
    ? (
        await admin
          .from("organizations")
          .select("id, name, slug")
          .eq("slug", "dap")
          .limit(1)
      ).data ?? []
    : (published.data ?? []);

  if (rows.length === 0) return [];

  const ids = rows.map((org) => org.id);
  const [profilesResult, membersResult, groupsResult, assetsResult] = await Promise.all([
    admin.from("profiles").select("id, org_id").in("org_id", ids).limit(5000),
    admin
      .from("organizations_users")
      .select("org_id, user_id")
      .in("org_id", ids)
      .eq("status", "active")
      .limit(5000),
    admin.from("groups").select("org_id").in("org_id", ids).limit(5000),
    admin
      .from("assets")
      .select("org_id, created_at")
      .in("org_id", ids)
      .order("created_at", { ascending: false })
      .limit(5000),
  ]);

  const memberCount = uniqueMembersByOrg(
    profilesResult.data ?? [],
    membersResult.data ?? [],
  );
  const groupCount = countByOrg(groupsResult.data ?? []);
  const reportCount = countByOrg(assetsResult.data ?? []);
  const latestByOrg = new Map<string, string>();
  for (const asset of assetsResult.data ?? []) {
    if (!latestByOrg.has(asset.org_id)) {
      latestByOrg.set(asset.org_id, asset.created_at);
    }
  }

  return rows.map((org) => ({
    id: org.id,
    name: org.name,
    slug: org.slug,
    tagline: org.tagline ?? null,
    accentColor: org.accent_color ?? "#3d5a80",
    members: memberCount.get(org.id) ?? 0,
    groups: groupCount.get(org.id) ?? 0,
    reports: reportCount.get(org.id) ?? 0,
    lastActive: latestByOrg.get(org.id) ?? null,
  }));
}

export async function getPublicOrganization(slug: string) {
  const organizations = await getPublicOrganizations();
  return organizations.find((org) => org.slug === slug) ?? null;
}

export async function getOrganizationForLogin(slug: string) {
  const published = await getPublicOrganization(slug);
  if (published) return published;
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return null;
  }
  const admin = await createAdminClient();
  const { data } = await admin
    .from("organizations")
    .select("id, name, slug, tagline, accent_color")
    .eq("slug", slug)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    name: data.name,
    slug: data.slug,
    tagline: data.tagline ?? null,
    accentColor: data.accent_color ?? "#3d5a80",
    members: 0,
    groups: 0,
    reports: 0,
    lastActive: null,
  } satisfies PublicOrganization;
}

function uniqueMembersByOrg(
  profiles: Array<{ id?: string; org_id: string | null }>,
  memberships: Array<{ org_id: string | null; user_id?: string | null }>,
) {
  const byOrg = new Map<string, Set<string>>();
  for (const row of memberships) {
    if (!row.org_id || !row.user_id) continue;
    const set = byOrg.get(row.org_id) ?? new Set<string>();
    set.add(row.user_id);
    byOrg.set(row.org_id, set);
  }
  for (const row of profiles) {
    if (!row.org_id || !row.id) continue;
    const set = byOrg.get(row.org_id) ?? new Set<string>();
    set.add(row.id);
    byOrg.set(row.org_id, set);
  }
  const counts = new Map<string, number>();
  for (const [orgId, users] of byOrg) counts.set(orgId, users.size);
  return counts;
}

function countByOrg(rows: Array<{ org_id: string | null }>) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!row.org_id) continue;
    counts.set(row.org_id, (counts.get(row.org_id) ?? 0) + 1);
  }
  return counts;
}
