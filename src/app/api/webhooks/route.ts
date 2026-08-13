import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

/**
 * GET /api/webhooks → latest raw webhook events (debug / app-review viewer).
 * Requires a logged-in user.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 200);

  try {
    const admin = await createAdminClient();
    const { data } = await admin
      .from("webhook_events")
      .select("id, direction, phone_number_id, waba_id, payload, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    return NextResponse.json({ events: data ?? [] });
  } catch {
    return NextResponse.json({ events: [] });
  }
}
