import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Auth callback used by Supabase magic links and OAuth providers.
 * Exchanges the `code` for a session, then redirects.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safePath(searchParams.get("next"), "/dashboard");
  const expectedOrg = searchParams.get("org");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
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
          return NextResponse.redirect(
            scopedLoginUrl(origin, expectedOrg, reason, next),
          );
        }
      }

      return NextResponse.redirect(new URL(next, origin));
    }
  }

  if (expectedOrg) {
    return NextResponse.redirect(
      scopedLoginUrl(origin, expectedOrg, "auth_callback_failed", next),
    );
  }
  return NextResponse.redirect(
    `${origin}/login?error=auth_callback_failed&redirect=${encodeURIComponent(next)}`,
  );
}

function safePath(value: string | null, fallback: string) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : fallback;
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
