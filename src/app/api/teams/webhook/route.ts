import { NextResponse } from "next/server";
import { validateInboundToken } from "@/lib/teams/auth";
import { handleTeamsActivity } from "@/lib/teams/handlers";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Microsoft Teams (Bot Framework) webhook.
 * Azure registers this URL as the bot's messaging endpoint. Every activity
 * (message, attachment upload, button press) arrives as an authenticated POST.
 *
 * The first validation POST from Azure may carry no Authorization header —
 * answer 200 so the endpoint registration succeeds.
 */
export async function POST(request: Request) {
  if (!process.env.TEAMS_BOT_ID || !process.env.TEAMS_BOT_PASSWORD) {
    return NextResponse.json({ error: "teams not configured" }, { status: 503 });
  }

  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";

  if (token) {
    const valid = await validateInboundToken(token).catch(() => false);
    if (!valid) {
      console.warn("[teams] rejected request with invalid bearer token");
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const activity = await request.json().catch(() => null);
  if (!activity) return NextResponse.json({ ok: true });

  await handleTeamsActivity(activity).catch((err) => {
    console.error(`[teams] handler error: ${err instanceof Error ? err.message : err}`);
  });

  return NextResponse.json({ ok: true });
}
