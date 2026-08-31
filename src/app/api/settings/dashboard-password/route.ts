import { NextRequest, NextResponse } from "next/server";
import {
  clearDashboardPassword,
  getDashboardPassword,
  getDashboardPasswordConfigured,
  setDashboardPassword,
} from "@/lib/dashboard-password-store";
import { requireOrgContext } from "@/lib/org-membership";

export const dynamic = "force-dynamic";

async function requireSuperAdminOrgApi(requestedSlug?: string | null) {
  const ctx = await requireOrgContext(requestedSlug);
  if (ctx.error) return { error: ctx.error };

  if (!ctx.isSuperAdmin) {
    return { error: Response.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { error: null, orgId: ctx.orgId, orgSlug: ctx.org.slug };
}

export async function GET(req: NextRequest) {
  const auth = await requireSuperAdminOrgApi(req.nextUrl.searchParams.get("org"));
  if (auth.error) return auth.error;

  const configured = await getDashboardPasswordConfigured(auth.orgId);
  const password = configured ? await getDashboardPassword(auth.orgId) : "";
  return NextResponse.json({ configured, password });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const auth = await requireSuperAdminOrgApi(
    typeof body.org === "string" ? body.org : request.nextUrl.searchParams.get("org"),
  );
  if (auth.error) return auth.error;

  try {
    if (body.clear === true) {
      await clearDashboardPassword(auth.orgId);
      return NextResponse.json({ configured: false });
    }

    if (typeof body.password !== "string" || !body.password.trim()) {
      return NextResponse.json({ error: "Password is required" }, { status: 400 });
    }

    await setDashboardPassword(auth.orgId, body.password);
    return NextResponse.json({
      configured: true,
      password: body.password.trim(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save password" },
      { status: 500 },
    );
  }
}
