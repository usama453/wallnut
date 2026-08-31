import { NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/org-membership";
import { createClient } from "@/lib/supabase/server";
import { userIsSuperAdmin } from "@/lib/roles";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const isSuperAdmin = await userIsSuperAdmin(user.id, user.email);
  const ctx = await requireOrgContext();
  if (ctx.error) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("org_id, role, organizations(name, slug)")
      .eq("id", user.id)
      .maybeSingle();
    const organization = Array.isArray(profile?.organizations)
      ? profile?.organizations[0] ?? null
      : profile?.organizations ?? null;
    return NextResponse.json({
      org_id: profile?.org_id ?? null,
      role: profile?.role ?? null,
      is_super_admin: isSuperAdmin,
      organization,
      memberships: [],
    });
  }

  return NextResponse.json({
    org_id: ctx.orgId,
    role: ctx.role,
    is_super_admin: ctx.isSuperAdmin,
    organization: {
      id: ctx.org.id,
      name: ctx.org.name,
      slug: ctx.org.slug,
    },
    memberships: ctx.memberships,
  });
}
