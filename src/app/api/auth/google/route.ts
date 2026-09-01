import { NextResponse, type NextRequest } from "next/server";
import { publicOrigin, safeAuthPath } from "@/lib/auth-origin";

/**
 * Google OAuth temporarily disabled — use email/password or the organization admin password.
 *
 * Start Google OAuth on the server so the PKCE verifier is stored in a real
 * Set-Cookie header before the browser leaves for Google.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const origin = publicOrigin(request);
  const org = searchParams.get("org");
  const next = safeAuthPath(searchParams.get("next"), org ? `/${org}` : "/");
  const loginPath = org ? `/login/${encodeURIComponent(org)}` : "/login";

  const fail = new URL(loginPath, origin);
  fail.searchParams.set("error", "google_disabled");
  fail.searchParams.set("redirect", next);
  return NextResponse.redirect(fail);
}
