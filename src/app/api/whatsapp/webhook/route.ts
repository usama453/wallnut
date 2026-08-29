import { NextResponse } from "next/server";
import { handleWhatsAppMessageEvent } from "@/lib/whatsapp/handlers";
import {
  constantTimeEqual,
  isWhatsAppEvent,
  verifyWahaWebhookHmac,
} from "@/lib/whatsapp/webhook";
import {
  WAHA_API_KEY,
  WAHA_SESSION,
  WAHA_WEBHOOK_HMAC_KEY,
} from "@/lib/whatsapp/config";

export const runtime = "nodejs";
export const maxDuration = 60;

/** WAHA webhook endpoint (HMAC or an exact custom X-Api-Key).
 * GET  — unused (WAHA doesn't require webhook verification)
 * POST — incoming messages and button callbacks */

export async function GET() {
  // WAHA doesn't require webhook verification; return 200.
  return new NextResponse("ok", { status: 200 });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (process.env.WHATSAPP_MOCK !== "1") {
    if (!WAHA_WEBHOOK_HMAC_KEY && !WAHA_API_KEY) {
      return NextResponse.json(
        { error: "webhook authentication is not configured" },
        { status: 503 },
      );
    }

    const validHmac = verifyWahaWebhookHmac(
      rawBody,
      request.headers.get("x-webhook-hmac"),
      WAHA_WEBHOOK_HMAC_KEY,
      request.headers.get("x-webhook-hmac-algorithm"),
    );
    const validApiKey = constantTimeEqual(
      WAHA_API_KEY,
      request.headers.get("x-api-key"),
    );
    if (!validHmac && !validApiKey) {
      return NextResponse.json({ error: "invalid webhook signature" }, { status: 401 });
    }
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (payload?.session && payload.session !== WAHA_SESSION) {
    return NextResponse.json({ ok: true, handled: false, action: "ignored" });
  }
  if (!isWhatsAppEvent(payload)) {
    return NextResponse.json({ ok: true, handled: false, action: "ignored" });
  }

  try {
    const result = await handleWhatsAppMessageEvent(payload);
    return NextResponse.json({
      ok: true,
      handled: result.handled,
      action: result.action,
    });
  } catch (error) {
    console.error(
      `[whatsapp] webhook failed: ${error instanceof Error ? error.message : error}`,
    );
    return NextResponse.json({ error: "webhook processing failed" }, { status: 500 });
  }
}
