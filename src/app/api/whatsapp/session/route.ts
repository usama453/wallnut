import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canCreateWhatsAppGroup, userIsSuperAdmin } from "@/lib/roles";
import {
  getWahaSessionState,
  runWahaSessionAction,
} from "@/lib/whatsapp/session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  const canManage = canCreateWhatsAppGroup(auth.role, auth.isSuperAdmin);
  const includeQr =
    canManage && request.nextUrl.searchParams.get("qr") === "1";
  const state = await getWahaSessionState(includeQr);
  return NextResponse.json(state, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  if (!canCreateWhatsAppGroup(auth.role, auth.isSuperAdmin)) {
    return NextResponse.json(
      { error: "Only owners, admins, and super admins can manage the WhatsApp connection" },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const action = body.action as
    | "create"
    | "start"
    | "restart"
    | "logout"
    | "configure-webhook"
    | undefined;
  if (
    action !== "create" &&
    action !== "start" &&
    action !== "restart" &&
    action !== "logout" &&
    action !== "configure-webhook"
  ) {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  try {
    await runWahaSessionAction(action);
    return NextResponse.json(await getWahaSessionState(true), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "WAHA operation failed" },
      { status: 502 },
    );
  }
}

async function requireUser(): Promise<{
  error: NextResponse | null;
  role: string | null;
  isSuperAdmin: boolean;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }),
      role: null,
      isSuperAdmin: false,
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.org_id) {
    return {
      error: NextResponse.json({ error: "No organization" }, { status: 400 }),
      role: null,
      isSuperAdmin: false,
    };
  }

  return {
    error: null,
    role: profile.role as string | null,
    isSuperAdmin: await userIsSuperAdmin(user.id, user.email),
  };
}
