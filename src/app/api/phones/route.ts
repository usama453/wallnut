import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { graphPost } from "@/lib/whatsapp/graph";
import { FB_REG_PIN } from "@/lib/whatsapp/config";
import { getOrgPhoneAccess } from "@/lib/whatsapp/phoneAuth";

/**
 * POST /api/phones
 *   { action: "register" | "request-code" | "verify-code" | "deregister", phoneNumberId, code? }
 * Mirrors the sample tech-provider endpoints (register / request-code / verify-code),
 * scoped to the authenticated user's org.
 * GET  /api/phones → list the org's connected phone numbers.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { action, phoneNumberId, code } = body;
  if (!action || !phoneNumberId) {
    return NextResponse.json({ error: "action and phoneNumberId are required" }, { status: 400 });
  }

  try {
    const accessToken = await getOrgPhoneAccess(String(phoneNumberId));
    let data: any;

    switch (action) {
      case "register":
        data = await graphPost(`/${phoneNumberId}/register`, accessToken, {
          messaging_product: "whatsapp",
          pin: FB_REG_PIN,
        });
        break;
      case "request-code":
        data = await graphPost(`/${phoneNumberId}/request_code?code_method=SMS&language=en`, accessToken);
        break;
      case "verify-code":
        if (!code) return NextResponse.json({ error: "code is required for verify-code" }, { status: 400 });
        data = await graphPost(`/${phoneNumberId}/verify_code?code=${code}`, accessToken);
        break;
      case "deregister":
        data = await graphPost(`/${phoneNumberId}/deregister`, accessToken);
        break;
      default:
        return NextResponse.json({ error: "unknown action" }, { status: 400 });
    }

    if (data?.error) {
      return NextResponse.json({ error: data.error.message ?? "Graph API error" }, { status: 400 });
    }
    return NextResponse.json({ success: true, action, ...data });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "operation failed" },
      { status: 400 },
    );
  }
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .maybeSingle();

  const { data } = await supabase
    .from("provider_phones")
    .select("phone_number_id, display_phone, waba_id, last_updated")
    .eq("org_id", profile?.org_id ?? "")
    .order("last_updated", { ascending: false });

  return NextResponse.json({ phones: data ?? [] });
}
