import "server-only";

import { scryptSync, timingSafeEqual, randomBytes } from "crypto";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/server";

const COOKIE_PREFIX = "wallnut_dash_";
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 90; // 90 days
const GUEST_USER_ID = "guest";

export { GUEST_USER_ID };

function dashboardSecret() {
  const secret =
    process.env.DASHBOARD_ACCESS_SECRET ??
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Missing dashboard access secret");
  return new TextEncoder().encode(secret);
}

export function hashDashboardPassword(password: string, salt?: string) {
  const s = salt ?? randomBytes(16).toString("hex");
  const hash = scryptSync(password, s, 64).toString("hex");
  return `${s}:${hash}`;
}

function verifyPasswordHash(password: string, stored: string) {
  const [salt, expected] = stored.split(":");
  if (!salt || !expected) return false;
  const actual = scryptSync(password, salt, 64).toString("hex");
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

async function getOrgPasswordHash(orgId: string) {
  const admin = await createAdminClient();
  const { data } = await admin
    .from("organizations")
    .select("dashboard_password_hash")
    .eq("id", orgId)
    .maybeSingle();
  return data?.dashboard_password_hash ?? null;
}

export async function orgHasDashboardPassword(orgId: string) {
  const hash = await getOrgPasswordHash(orgId);
  return Boolean(hash);
}

export async function verifyDashboardPassword(orgId: string, password: string) {
  const hash = await getOrgPasswordHash(orgId);
  if (!hash) return false;
  return verifyPasswordHash(password, hash);
}

function cookieName(orgId: string) {
  return `${COOKIE_PREFIX}${orgId}`;
}

export async function createDashboardAccessToken(orgId: string) {
  return new SignJWT({ orgId, typ: "dashboard" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_TTL_SECONDS}s`)
    .sign(dashboardSecret());
}

export async function verifyDashboardAccessToken(token: string, orgId: string) {
  try {
    const { payload } = await jwtVerify(token, dashboardSecret());
    return payload.typ === "dashboard" && payload.orgId === orgId;
  } catch {
    return false;
  }
}

export async function hasDashboardAccess(orgId: string) {
  const jar = await cookies();
  const token = jar.get(cookieName(orgId))?.value;
  if (!token) return false;
  return verifyDashboardAccessToken(token, orgId);
}

export function dashboardAccessCookieOptions() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const secure =
    process.env.NODE_ENV === "production" || appUrl.startsWith("https://");
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge: TOKEN_TTL_SECONDS,
  };
}

export function dashboardAccessCookieName(orgId: string) {
  return cookieName(orgId);
}
