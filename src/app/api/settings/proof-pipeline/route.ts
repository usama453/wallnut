import { NextRequest, NextResponse } from "next/server";
import { requireProofConfigApi } from "@/lib/proof-config-access";

export const dynamic = "force-dynamic";

/** Split pipeline is retired; this route only reports Gemini direct. */
export async function GET(req: NextRequest) {
  const auth = await requireProofConfigApi(req.nextUrl.searchParams.get("org"));
  if (auth.error) return auth.error;
  return NextResponse.json({ mode: "gemini_only", envLocked: true });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const auth = await requireProofConfigApi(
    typeof body.org === "string" ? body.org : request.nextUrl.searchParams.get("org"),
  );
  if (auth.error) return auth.error;
  return NextResponse.json({ mode: "gemini_only" });
}
