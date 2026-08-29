import { NextResponse, type NextRequest } from "next/server";

export function safeAuthPath(value: string | null, fallback: string) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : fallback;
}

export function publicOrigin(request: NextRequest) {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const proto = (forwardedProto ?? "https").split(",")[0]?.trim() || "https";
  if (host) {
    const hostname = host.split(",")[0]?.trim();
    if (
      hostname &&
      !hostname.startsWith("127.") &&
      hostname !== "localhost:3000" &&
      !hostname.startsWith("172.")
    ) {
      return `${proto}://${hostname}`;
    }
  }
  const fallback = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (fallback) return fallback;
  return new URL(request.url).origin;
}

export function copyCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set(cookie);
  });
}

export function callbackUrl(origin: string, next: string, org?: string | null) {
  const params = new URLSearchParams({ next });
  if (org) params.set("org", org);
  return `${origin}/auth/callback?${params.toString()}`;
}
