import { NextResponse } from "next/server";
import { handleWhatsAppMessageEvent } from "@/lib/whatsapp/handlers";
import { isWhatsAppEvent, verifySignature } from "@/lib/whatsapp/webhook";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * WhatsApp Business Cloud API webhook.
 * GET  — webhook verification (hub.challenge)
 * POST — incoming messages / button callbacks
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse("Verification failed", { status: 403 });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  // For WAHA mode, skip signature verification (WAHA uses API key auth)
  const isWaha = request.headers.get("x-waha-signature") !== null || request.headers.get("x-api-key") !== null;
  if (!isWaha) {
    if (!verifySignature(rawBody, signature)) {
      return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    }
  }

  const payload = JSON.parse(rawBody);
  if (!isWaha && !isWhatsAppEvent(payload)) {
    return NextResponse.json({ ok: true });
  }

  // Events arrive in arrays; process each message event. Concurrent handling +
  // the proof semaphore keeps bursts within the 60s function budget.
  const events = isWaha
    ? [payload] // WAHA sends single event per webhook
    : payload.entry.flatMap((entry: any) =>
        (entry.changes ?? []).filter((c: any) => c.field === "messages"),
      );

  await Promise.allSettled(events.map((change: any) => handleWhatsAppMessageEvent(change, request.headers)));

  // Always acknowledge immediately to avoid retries.
  return NextResponse.json({ ok: true });
}
