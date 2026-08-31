import "server-only";

import { requireOrgContext } from "@/lib/org-membership";
import { listUserMemberships } from "@/lib/org-membership";
import { userIsSuperAdmin } from "@/lib/roles";

/** Super admins and org owners/admins can manage proof settings for their org. */
export async function canManageProofConfigForOrg(
  userId: string,
  orgId: string,
  email?: string | null,
): Promise<boolean> {
  if (await userIsSuperAdmin(userId, email)) return true;
  const memberships = await listUserMemberships(userId);
  return memberships.some(
    (membership) =>
      membership.orgId === orgId &&
      (membership.role === "owner" || membership.role === "admin"),
  );
}

/** @deprecated Use canManageProofConfigForOrg with a specific org id. */
export async function canManageProofConfig(
  userId: string,
  email?: string | null,
): Promise<boolean> {
  if (await userIsSuperAdmin(userId, email)) return true;
  const memberships = await listUserMemberships(userId);
  return memberships.some(
    (membership) => membership.role === "owner" || membership.role === "admin",
  );
}

export async function requireProofConfigApi(requestedSlug?: string | null) {
  const ctx = await requireOrgContext(requestedSlug);
  if (ctx.error) return { error: ctx.error };

  if (!ctx.isSuperAdmin && ctx.role !== "owner" && ctx.role !== "admin") {
    return { error: Response.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { error: null, orgId: ctx.orgId, orgSlug: ctx.org.slug };
}
