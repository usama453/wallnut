import { NextResponse } from "next/server";
import {
  createDashboardAccessToken,
  dashboardAccessCookieName,
  dashboardAccessCookieOptions,
  orgHasDashboardPassword,
  verifyDashboardPassword,
} from "@/lib/dashboard-access";
import { getOrgBySlug } from "@/lib/org-membership";
import { orgHomePath } from "@/lib/org-paths";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const slug = typeof body?.slug === "string" ? body.slug.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!slug || !password) {
    return NextResponse.json({ error: "Slug and password are required" }, { status: 400 });
  }

  const org = await getOrgBySlug(slug);
  if (!org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  if (!(await orgHasDashboardPassword(org.id))) {
    return NextResponse.json(
      { error: "This workspace does not have a dashboard password configured" },
      { status: 400 },
    );
  }

  if (!(await verifyDashboardPassword(org.id, password))) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  const token = await createDashboardAccessToken(org.id);
  const response = NextResponse.json({
    ok: true,
    redirect: orgHomePath(org.slug),
  });
  response.cookies.set(
    dashboardAccessCookieName(org.id),
    token,
    dashboardAccessCookieOptions(),
  );
  return response;
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get("slug")?.trim() ?? "";
  const org = slug ? await getOrgBySlug(slug) : null;

  const response = NextResponse.json({ ok: true });
  if (org) {
    response.cookies.set(dashboardAccessCookieName(org.id), "", {
      ...dashboardAccessCookieOptions(),
      maxAge: 0,
    });
  }
  return response;
}
