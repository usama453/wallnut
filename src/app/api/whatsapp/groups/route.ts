import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { randomInt } from "crypto";

export async function GET() {
  const ctx = await requireOrg();
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
  const ctx = await requireOrg();
  if (ctx.error) return ctx.error;

  // Only owners and admins can create auth codes.
  if (ctx.role !== "owner" && ctx.role !== "admin") {
    return NextResponse.json(
      { error: "Only owners and admins can create auth codes" },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const action = body.action;

  if (action !== "create") {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  // Ensure uniqueness (best-effort loop, very low collision probability).
  const admin = await createAdminClient();
  let code = createAuthCode();
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: existing, error: lookupError } = await admin
      .from("whatsapp_group_auth_codes")
      .select("id")
      .eq("code", code)
      .maybeSingle();
    if (lookupError) {
      return NextResponse.json({ error: lookupError.message }, { status: 500 });
    }
    if (!existing) break;
    code = createAuthCode();
  }

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const { data, error } = await admin
    .from("whatsapp_group_auth_codes")
    .insert({ org_id: ctx.orgId, code, expires_at: expiresAt })
    .select("id, code, expires_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    id: data.id,
    code: data.code,
    expiresAt: data.expires_at,
    hint:
      "Paste this code inside the WhatsApp group. The bot will link the group to your workspace.",
  });
}

function createAuthCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O or 1/I/L
  let code = "WN-";
  for (let i = 0; i < 6; i++) {
    code += chars[randomInt(chars.length)];
  }
  return code;
}

async function requireOrg() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.org_id) {
    return { error: NextResponse.json({ error: "No organization" }, { status: 400 }) };
  }
  return { orgId: profile.org_id, role: profile.role };
}
