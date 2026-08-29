import { createServerClient, type CookieMethodsServer } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Auth callback used by Supabase magic links and OAuth providers.
 * Exchanges the `code` for a session, then redirects.
 *
 * Cookies must be written onto the redirect response. `cookies().set()` from
 * next/headers is discarded when a Route Handler returns NextResponse.redirect(),
 * which is why Google sign-in looked like it "landed" on this URL.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const expectedOrg = searchParams.get("org");
  const next = safePath(
    searchParams.get("next"),
    expectedOrg ? `/${expectedOrg}` : "/",
  );
  const origin = publicOrigin(request);

  if (!code) {
    return NextResponse.redirect(failureUrl(origin, expectedOrg, next));
  }

  const pending = NextResponse.redirect(new URL(next, origin));
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
            pending.cookies.set(name, value, options);
          });
        }) as CookieMethodsServer["setAll"],
      },
    },
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error("auth callback exchange failed:", error.message);
    return NextResponse.redirect(failureUrl(origin, expectedOrg, next));
  }

  if (expectedOrg) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: profile } = await supabase
      .from("profiles")
      .select("organizations(slug)")
      .eq("id", user?.id ?? "")
      .maybeSingle();
    const organization = Array.isArray(profile?.organizations)
      ? profile.organizations[0] ?? null
      : profile?.organizations ?? null;

    if (!organization?.slug || organization.slug !== expectedOrg) {
      await supabase.auth.signOut();
      const reason = organization?.slug ? "wrong_org" : "profile_not_ready";
      const response = NextResponse.redirect(
        scopedLoginUrl(origin, expectedOrg, reason, next),
      );
      copyCookies(pending, response);
      return response;
    }
  }

  const destination = next === "/" ? await homeForSession(supabase) : next;
  const response = NextResponse.redirect(new URL(destination, origin));
  copyCookies(pending, response);
  return response;
}

function publicOrigin(request: NextRequest) {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const proto = (forwardedProto ?? "https").split(",")[0]?.trim() || "https";
  if (host) {
    const hostname = host.split(",")[0]?.trim();
    if (hostname && !hostname.startsWith("127.") && hostname !== "localhost:3000") {
      return `${proto}://${hostname}`;
    }
  }
  const fallback = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (fallback) return fallback;
  return new URL(request.url).origin;
}

function copyCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set(cookie);
  });
}

async function homeForSession(
  supabase: ReturnType<typeof createServerClient>,
) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "/";
  const { data: profile } = await supabase
    .from("profiles")
    .select("organizations(slug)")
    .eq("id", user.id)
    .maybeSingle();
  const organization = Array.isArray(profile?.organizations)
    ? profile.organizations[0] ?? null
    : profile?.organizations ?? null;
  return organization?.slug ? `/${organization.slug}` : "/";
}

function safePath(value: string | null, fallback: string) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : fallback;
}

function failureUrl(origin: string, expectedOrg: string | null, next: string) {
  if (expectedOrg) return scopedLoginUrl(origin, expectedOrg, "auth_callback_failed", next);
  const url = new URL("/login", origin);
  url.searchParams.set("error", "auth_callback_failed");
  url.searchParams.set("redirect", next);
  return url;
}

function scopedLoginUrl(
  origin: string,
  org: string,
  error: string,
  redirect: string,
) {
  const url = new URL(`/login/${encodeURIComponent(org)}`, origin);
  url.searchParams.set("error", error);
  url.searchParams.set("redirect", redirect);
  return url;
}
