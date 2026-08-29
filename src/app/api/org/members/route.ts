import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireOrgContext } from "@/lib/org-membership";

const ROLES = ["owner", "admin", "member", "viewer"] as const;

/**
 * GET   /api/org/members → { orgId, role, members[], invites[] }
 * POST  /api/org/members { action: "invite", email, role? }  (owner/admin)
 *       | { action: "remove", id }                            (owner/admin)
 *       | { action: "role", id, role }                        (owner only)
 *
 * Manages the authenticated user's org membership and pending email invites.
 */
export async function GET(req: NextRequest) {
  const ctx = await requireOrgContext(req.nextUrl.searchParams.get("org"));
  if (ctx.error) return ctx.error;

  const admin = await createAdminClient();
  const [{ data: members }, { data: invites }] = await Promise.all([
    admin
      .from("organizations_users")
      .select("id, user_id, role, created_at")
      .eq("org_id", ctx.orgId)
      .eq("status", "active"),
    admin
      .from("organizations_users")
      .select("id, invited_email, invited_by, role, created_at")
      .eq("org_id", ctx.orgId)
      .eq("status", "pending"),
  ]);

  // Pull display names/emails for active members from auth.users.
  const userIds = (members ?? []).map((m) => m.user_id).filter(Boolean);
  const emailsByName = new Map<string, string>();
  if (userIds.length) {
    const { data: users } = await admin
      .from("auth.users")
      .select("id, email")
      .in("id", userIds);
    for (const u of users ?? []) emailsByName.set(u.id, u.email);
  }
  const resolvedMembers = (members ?? []).map((m) => ({
    ...m,
    email: emailsByName.get(m.user_id) ?? null,
  }));

  return NextResponse.json({
    orgId: ctx.orgId,
    role: ctx.role,
    members: resolvedMembers,
    invites: invites ?? [],
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const ctx = await requireOrgContext(
    typeof body.org === "string" ? body.org : req.nextUrl.searchParams.get("org"),
  );
  if (ctx.error) return ctx.error;
  const admin = await createAdminClient();

  switch (body.action) {
    case "invite": {
      if (ctx.role !== "owner" && ctx.role !== "admin") {
        return NextResponse.json({ error: "Only owners and admins can invite" }, { status: 403 });
      }
      const email = String(body.email ?? "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return NextResponse.json({ error: "Valid email required" }, { status: 400 });
      }
      const role = ROLES.includes(body.role as (typeof ROLES)[number])
        ? (body.role as string)
        : "member";

      // Existing registered user by email?
      const { data: existing } = await admin
        .from("auth.users")
        .select("id")
        .eq("email", email)
        .maybeSingle();

      let result;
      if (existing?.id) {
      const { data: already } = await admin
        .from("organizations_users")
        .select("id")
        .eq("user_id", existing.id)
        .eq("org_id", ctx.orgId)
        .maybeSingle();
        if (already) {
          return NextResponse.json({ error: "This person is already in your org" }, { status: 400 });
        }
        result = await admin.from("organizations_users").insert({
          org_id: ctx.orgId,
          user_id: existing.id,
          role,
          status: "active",
        });
      } else {
        result = await admin.from("organizations_users").insert({
          org_id: ctx.orgId,
          invited_email: email,
          invited_by: ctx.userId,
          role,
          status: "pending",
        });
      }
      if (result.error) {
        if (result.error.code === "23505") {
          return NextResponse.json({ error: "That email is already invited or a member" }, { status: 400 });
        }
        throw result.error;
      }
      break;
    }
    case "remove": {
      if (ctx.role !== "owner" && ctx.role !== "admin") {
        return NextResponse.json({ error: "Only owners and admins can remove members" }, { status: 403 });
      }
      const { error } = await admin
        .from("organizations_users")
        .delete()
        .eq("id", String(body.id))
        .eq("org_id", ctx.orgId);
      if (error) throw error;
      break;
    }
    case "role": {
      if (ctx.role !== "owner") {
        return NextResponse.json({ error: "Only the owner can change roles" }, { status: 403 });
      }
      const next = body.role as string;
      if (!ROLES.includes(next as (typeof ROLES)[number])) {
        return NextResponse.json({ error: "Invalid role" }, { status: 400 });
      }
      const { error } = await admin
        .from("organizations_users")
        .update({ role: next })
        .eq("id", String(body.id))
        .eq("org_id", ctx.orgId);
      if (error) throw error;
      break;
    }
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
