import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireOrgContext } from "@/lib/org-membership";
import { isPublicOrgSlug } from "@/lib/org-paths";
import { canCreateWhatsAppGroup } from "@/lib/roles";
import { createPlaceholderWhatsAppGroup, removeWhatsAppGroupFromOrg } from "@/lib/whatsapp/placeholder-groups";

export async function GET(req: NextRequest) {
  const ctx = await requireOrgContext(req.nextUrl.searchParams.get("org"));
  if (ctx.error) return ctx.error;

  const admin = await createAdminClient();
  const { data: codes } = await admin
    .from("whatsapp_group_auth_codes")
    .select("id, code, status, expires_at, group_jid, group_name, created_at, used_at")
    .eq("org_id", ctx.orgId)
    .order("created_at", { ascending: false });

  const { data: groups } = await admin
    .from("groups")
    .select("id, name, external_id, platform, created_at")
    .eq("org_id", ctx.orgId)
    .eq("platform", "whatsapp")
    .order("created_at", { ascending: false });

  const now = new Date();
  const result = (codes ?? []).map((c) => ({
    id: c.id,
    code: c.code,
    status: c.status,
    isExpired: c.status === "pending" && new Date(c.expires_at) < now,
    expiresAt: c.expires_at,
    groupJid: c.group_jid,
    groupName: c.group_name,
    createdAt: c.created_at,
    usedAt: c.used_at,
  }));

  return NextResponse.json({
    codes: result,
    groups: groups ?? [],
    now: now.toISOString(),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const ctx = await requireOrgContext(
    typeof body.org === "string" ? body.org : req.nextUrl.searchParams.get("org"),
  );
  if (ctx.error) return ctx.error;

  if (!canCreateWhatsAppGroup(ctx.role, ctx.isSuperAdmin)) {
    return NextResponse.json(
      { error: "Only owners, admins, and super admins can create codes" },
      { status: 403 },
    );
  }

  const action = body.action;

  if (action === "create") {
    if (isPublicOrgSlug(ctx.org.slug)) {
      return NextResponse.json(
        {
          error:
            "Public is a catch-all inbox. Create link codes from the team workspace you want the group assigned to.",
        },
        { status: 400 },
      );
    }
    try {
      const created = await createPlaceholderWhatsAppGroup(ctx.orgId);
      return NextResponse.json({
        id: created.id,
        code: created.code,
        expiresAt: created.expiresAt,
        groupId: created.groupId,
        groupName: created.groupName,
        hint:
          "Paste this code inside the WhatsApp group. The bot will link the group to your workspace.",
      });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Failed to create code" },
        { status: 500 },
      );
    }
  }

  if (action === "remove") {
    const groupId = typeof body.groupId === "string" ? body.groupId : undefined;
    const code = typeof body.code === "string" ? body.code : undefined;
    if (!groupId && !code) {
      return NextResponse.json({ error: "groupId or code is required" }, { status: 400 });
    }
    try {
      await removeWhatsAppGroupFromOrg(ctx.orgId, { groupId, code });
      return NextResponse.json({ ok: true });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Failed to remove group" },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
