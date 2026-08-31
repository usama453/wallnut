import { createServerClient, type CookieMethodsServer } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { copyCookies, publicOrigin, safeAuthPath } from "@/lib/auth-origin";

/**
 * Auth callback used by Supabase magic links, email confirmations, and OAuth.
 * Exchanges the `code` or `token_hash` for a session, then redirects.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const otpType = searchParams.get("type") as EmailOtpType | null;
  const expectedOrg = searchParams.get("org");
  const next = safeAuthPath(
    searchParams.get("next"),
    expectedOrg ? `/${expectedOrg}` : "/",
  );
  const origin = publicOrigin(request);

  if (!code && !(tokenHash && otpType)) {
    return NextResponse.redirect(failureUrl(origin, expectedOrg, next));
  }

  try {
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

    const authError = code
      ? (await supabase.auth.exchangeCodeForSession(code)).error
      : (
          await supabase.auth.verifyOtp({
            type: otpType!,
            token_hash: tokenHash!,
          })
        ).error;

    if (authError) {
      console.error("auth callback session failed:", authError.message, {
        hasCode: Boolean(code),
        hasTokenHash: Boolean(tokenHash),
        otpType,
        cookieNames: request.cookies.getAll().map((cookie) => cookie.name),
      });
      return NextResponse.redirect(failureUrl(origin, expectedOrg, next));
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      const response = NextResponse.redirect(failureUrl(origin, expectedOrg, next));
      copyCookies(pending, response);
      return response;
    }

    const { userIsSuperAdmin } = await import("@/lib/roles");
    if (!(await userIsSuperAdmin(user.id, user.email))) {
      await supabase.auth.signOut();
      const failTarget = expectedOrg
        ? scopedLoginUrl(origin, expectedOrg, "admin_only", next)
        : (() => {
            const url = new URL("/login", origin);
            url.searchParams.set("error", "admin_only");
            url.searchParams.set("redirect", next);
            return url;
          })();
      const response = NextResponse.redirect(failTarget);
      copyCookies(pending, response);
      return response;
    }

    if (expectedOrg) {
      const {
        data: { user: orgUser },
      } = await supabase.auth.getUser();
      if (!orgUser) {
        const response = NextResponse.redirect(
          scopedLoginUrl(origin, expectedOrg, "profile_not_ready", next),
        );
        copyCookies(pending, response);
        return response;
      }

      const { listUserMemberships, userCanAccessOrg } = await import(
        "@/lib/org-membership"
      );
      const allowed = await userCanAccessOrg(orgUser.id, expectedOrg);
      if (!allowed) {
        const memberships = await listUserMemberships(orgUser.id);
        const fallback = memberships.find((membership) => membership.isPublic)?.slug;
        if (fallback) {
          const response = NextResponse.redirect(new URL(`/${fallback}`, origin));
          copyCookies(pending, response);
          return response;
        }
        await supabase.auth.signOut();
        const response = NextResponse.redirect(
          scopedLoginUrl(origin, expectedOrg, "wrong_org", next),
        );
        copyCookies(pending, response);
        return response;
      }
    }

    const destination = next === "/" ? await homeForSession() : next;
    const response = NextResponse.redirect(new URL(destination, origin));
    copyCookies(pending, response);
    return response;
  } catch (error) {
    console.error("auth callback crashed:", error);
    return NextResponse.redirect(failureUrl(origin, expectedOrg, next));
  }
}

async function homeForSession() {
  const { getAuthedOrgSlug } = await import("@/lib/org-access");
  const slug = await getAuthedOrgSlug();
  return slug ? `/${slug}` : "/";
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
