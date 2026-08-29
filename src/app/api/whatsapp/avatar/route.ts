import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveConnection } from "@/lib/whatsapp/connection";
import { phoneDigits } from "@/lib/whatsapp/jid";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const phone = phoneDigits(request.nextUrl.searchParams.get("phone"));
  if (phone.length < 6) return new NextResponse("Not found", { status: 404 });

  const connection = await resolveConnection();
  if (!connection) return new NextResponse("Not configured", { status: 404 });

  const jid = `${phone}@s.whatsapp.net`;
  try {
    const base = connection.baseUrl.endsWith("/")
      ? connection.baseUrl
      : `${connection.baseUrl}/`;
    const target = new URL(
      `api/${encodeURIComponent(connection.session)}/contacts/${encodeURIComponent(jid)}/profile-picture`,
      base,
    );
    const response = await fetch(target, {
      headers: { "X-Api-Key": connection.apiKey },
      cache: "no-store",
    });
    if (!response.ok) return new NextResponse("Not found", { status: 404 });
    const buffer = await response.arrayBuffer();
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": response.headers.get("content-type") || "image/jpeg",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
