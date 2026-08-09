import { NextResponse } from "next/server";

// Short shareable report link: /r/<slug> → full report page.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  return NextResponse.redirect(new URL(`/reports/${slug}`, _req.url), 307);
}
