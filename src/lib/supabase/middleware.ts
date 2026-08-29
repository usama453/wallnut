import { createServerClient, type CookieMethodsServer } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isReservedOrgSlug, ORG_COOKIE, PUBLIC_ORG_SLUG } from "@/lib/org-paths";

export async function updateSession(request: NextRequest) {
  // Allow the app to boot without Supabase configured (e.g. WhatsApp-only local dev).
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll: ((cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        }) as CookieMethodsServer["setAll"],
      },
    },
  );

  await supabase.auth.getUser();

  const first = request.nextUrl.pathname.split("/").filter(Boolean)[0] ?? "";
  if (first === "default") {
    const url = request.nextUrl.clone();
    url.pathname = request.nextUrl.pathname.replace(/^\/default/, `/${PUBLIC_ORG_SLUG}`);
    const redirect = NextResponse.redirect(url, 308);
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirect.cookies.set(cookie);
    });
    redirect.cookies.set(ORG_COOKIE, PUBLIC_ORG_SLUG, {
      path: "/",
      sameSite: "lax",
    });
    return redirect;
  }

  if (first && !isReservedOrgSlug(first) && !first.includes(".")) {
    supabaseResponse.cookies.set(ORG_COOKIE, first, {
      path: "/",
      sameSite: "lax",
    });
  }

  // Route layouts enforce access; middleware only refreshes the Supabase session.
  return supabaseResponse;
}
