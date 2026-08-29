import { createServerClient, type CookieMethodsServer } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  callbackUrl,
  copyCookies,
  publicOrigin,
  safeAuthPath,
} from "@/lib/auth-origin";

/**
 * Start Google OAuth on the server so the PKCE verifier is stored in a real
 * Set-Cookie header before the browser leaves for Google. Browser-side
 * signInWithOAuth was dropping that cookie, so /auth/callback had nothing to
 * exchange.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const origin = publicOrigin(request);
  const org = searchParams.get("org");
  const next = safeAuthPath(searchParams.get("next"), org ? `/${org}` : "/");
  const loginPath = org ? `/login/${encodeURIComponent(org)}` : "/login";

  const pending = NextResponse.redirect(origin);
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll: ((cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            pending.cookies.set(name, value, {
              ...options,
              sameSite: "lax",
              path: "/",
              secure: origin.startsWith("https://"),
            });
          });
        }) as CookieMethodsServer["setAll"],
      },
    },
  );

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: callbackUrl(origin, next, org),
      skipBrowserRedirect: true,
    },
  });

  if (error || !data.url) {
    console.error("google oauth start failed:", error?.message);
    const fail = new URL(loginPath, origin);
    fail.searchParams.set("error", "auth_callback_failed");
    fail.searchParams.set("redirect", next);
    return NextResponse.redirect(fail);
  }

  const response = NextResponse.redirect(data.url);
  copyCookies(pending, response);
  return response;
}
