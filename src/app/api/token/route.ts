import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { exchangeCodeForToken, graphPost } from "@/lib/whatsapp/graph";
import { FB_REG_PIN } from "@/lib/whatsapp/config";

/**
 * POST  Exchange the Facebook Login for Business code → long-lived access token,
 *       persist it against the WABA id, register the phone number (if ES option
 *       enabled) and subscribe the app to the WABA webhook. Mirrors the sample
 *       tech-provider app's /api/token endpoint, but scoped to WhatsApp only.
 * GET   List persisted WABA tokens (used by the connect page to show state).
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const {
    code,
    app_id: appId,
    waba_id: wabaId,
    business_id: businessId,
    phone_number_id: phoneNumberId,
    org_id: orgId,
    es_option_reg: esOptionReg,
    es_option_sub: esOptionSub,
  } = body;

  if (!code || !appId || !businessId || !wabaId) {
    return NextResponse.json({ error: "code, app_id, business_id and waba_id are required" }, { status: 400 });
  }

  try {
    const accessToken = await exchangeCodeForToken(code);

    const operations: { name: string; ok: boolean; detail?: string }[] = [];

    // Persist the WABA token for multi-tenant resolution later.
    const admin = await createAdminClient();
    await admin.from("provider_wabas").upsert(
      {
        waba_id: wabaId,
        org_id: orgId ?? null,
        business_id: businessId ?? null,
        access_token: accessToken,
        last_updated: new Date().toISOString(),
      },
      { onConflict: "waba_id" },
    );
    operations.push({ name: "saveWabaToken", ok: true });

    // Persist the phone connection (number is resolved by webhook metadata).
    if (phoneNumberId) {
      const { error: phoneErr } = await admin.from("provider_phones").upsert(
        {
          phone_number_id: phoneNumberId,
          waba_id: wabaId,
          org_id: orgId ?? null,
          business_id: businessId ?? null,
          access_token: accessToken,
          last_updated: new Date().toISOString(),
        },
        { onConflict: "phone_number_id" },
      );
      operations.push({ name: "savePhone", ok: !phoneErr, detail: phoneErr?.message });
    }

    // Register the number (requires a 6-digit PIN set on the app config).
    if (esOptionReg && phoneNumberId) {
      const reg = await graphPost(`/${phoneNumberId}/register`, accessToken, {
        messaging_product: "whatsapp",
        pin: FB_REG_PIN,
      });
      operations.push({
        name: "registerNumber",
        ok: !reg?.error,
        detail: reg?.error?.message ?? (reg?.success ? "registered" : JSON.stringify(reg).slice(0, 120)),
      });
    }

    // Subscribe the app to the WABA so our webhook receives messages.
    if (esOptionSub && wabaId) {
      const sub = await graphPost(`/${wabaId}/subscribed_apps`, accessToken);
      operations.push({
        name: "subscribeWebhook",
        ok: !sub?.error,
        detail: sub?.error?.message ?? (sub?.success ? "subscribed" : JSON.stringify(sub).slice(0, 120)),
      });
    }

    return NextResponse.json({ success: true, wabaId, operations });
  } catch (err) {
    console.error("[token] exchange failed:", err);
    return NextResponse.json({ error: "token exchange failed" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const admin = await createAdminClient();
    const { data } = await admin.from("provider_wabas").select("waba_id, org_id, last_updated");
    return NextResponse.json({ wabas: data ?? [] });
  } catch {
    return NextResponse.json({ wabas: [] });
  }
}
