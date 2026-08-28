import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";

/**
 * GET    /api/whatsapp/access → { mode, allowed[], recent[] }
 * POST   /api/whatsapp/access { action: "mode", mode } | { action: "add", chatId, label? }
 *        | { action: "remove", id }
 *
 * Controls which chats the WhatsApp bot responds to. Scoped to the
 * authenticated user's org.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const orgId = await getOrgId(supabase, user.id);
  if (!orgId) return NextResponse.json({ error: "No organization" }, { status: 400 });

  const admin = await createAdminClient();
  const [{ data: settings }, { data: allowed }, { data: recent }] = await Promise.all([
    admin.from("whatsapp_settings").select("response_mode").eq("org_id", orgId).maybeSingle(),
    admin
      .from("whatsapp_allowlist")
      .select("id, chat_id, label, created_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false }),
    admin
      .from("whatsapp_seen_chats")
      .select("chat_id, label, message_count, last_message_at, org_id")
      .or(`org_id.eq.${orgId},org_id.is.null`)
      .order("last_message_at", { ascending: false })
      .limit(25),
  ]);

  return NextResponse.json({
    mode: settings?.response_mode === "allowlist" ? "allowlist" : "all",
    allowed: allowed ?? [],
    // Chats not yet allowlisted — the "pending" candidates.
    recent: (recent ?? []).filter((c) => !(allowed ?? []).some((a) => a.chat_id === c.chat_id)),
  });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const orgId = await getOrgId(supabase, user.id);
  if (!orgId) return NextResponse.json({ error: "No organization" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const admin = await createAdminClient();

  try {
    switch (body.action) {
      case "mode": {
        const mode = body.mode === "allowlist" ? "allowlist" : "all";
        const { error } = await admin
          .from("whatsapp_settings")
          .upsert({ org_id: orgId, response_mode: mode, updated_at: new Date().toISOString() });
        if (error) throw error;
        break;
      }
      case "add": {
        const chatId = String(body.chatId ?? "").trim();
        if (!chatId) return NextResponse.json({ error: "chatId required" }, { status: 400 });
        const normalized = normalizeChatId(chatId);
        const { error } = await admin.from("whatsapp_allowlist").upsert(
          {
            org_id: orgId,
            chat_id: normalized,
            label: body.label ? String(body.label).slice(0, 120) : null,
          },
          { onConflict: "org_id,chat_id" },
        );
        if (error) throw error;
        break;
      }
      case "remove": {
        const { error } = await admin
          .from("whatsapp_allowlist")
          .delete()
          .eq("id", String(body.id))
          .eq("org_id", orgId);
        if (error) throw error;
        break;
      }
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Operation failed" },
      { status: 400 },
    );
  }
}

async function getOrgId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", userId)
    .maybeSingle();
  return profile?.org_id ?? null;
}

/** Accept bare numbers ("923345818677") or full JIDs; keep JIDs verbatim. */
function normalizeChatId(raw: string): string {
  if (raw.includes("@")) return raw;
  const digits = raw.replace(/[^0-9]/g, "");
  return `${digits}@s.whatsapp.net`;
}
