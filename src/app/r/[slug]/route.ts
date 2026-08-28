import { NextResponse } from "next/server";

// Short shareable report link: /r/<slug> → full report page.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  // Behind a reverse proxy, req.url can resolve to the internal address
  // (e.g. http://localhost:3000). WhatsApp link previews follow this 307 and
  // rewrite the visible URL to it, so build the origin from forwarded headers
  // first, then fall back to the public app URL.
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const base = host ? `${proto}://${host}` : process.env.NEXT_PUBLIC_APP_URL ?? "https://bot.usama.fun";
  return NextResponse.redirect(new URL(`/reports/${slug}`, base), 307);
}
