import "server-only";

import { createClient } from "@/lib/supabase/server";
import { listUserMemberships } from "@/lib/org-membership";
import { userIsSuperAdmin } from "@/lib/roles";

/** Super admins and org owners/admins can manage platform proof settings. */
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

export async function requireProofConfigApi() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: Response.json({ error: "Not authenticated" }, { status: 401 }) };
  }
  if (!(await canManageProofConfig(user.id, user.email))) {
    return { error: Response.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { error: null };
}
