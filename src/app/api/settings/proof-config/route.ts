import { NextRequest, NextResponse } from "next/server";
import {
  getProofAdminSettings,
  setProofAdminSettings,
} from "@/lib/proof/proof-settings-store";
import {
  normalizeProofAdminSettings,
  PROOF_CHECK_TYPES,
  PROOF_RESPONSE_STYLES,
} from "@/lib/proof/proof-settings";
import { requireProofConfigApi } from "@/lib/proof-config-access";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireProofConfigApi();
  if (auth.error) return auth.error;

  const settings = await getProofAdminSettings();
  return NextResponse.json(settings);
}

export async function POST(request: NextRequest) {
  const auth = await requireProofConfigApi();
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const current = await getProofAdminSettings();

  const nextChecks = { ...current.checks };
  if (body.checks && typeof body.checks === "object") {
    for (const key of PROOF_CHECK_TYPES) {
      const value = body.checks[key];
      if (typeof value === "boolean") nextChecks[key] = value;
    }
  }

  let nextStyle = current.responseStyle;
  if (PROOF_RESPONSE_STYLES.includes(body.responseStyle)) {
    nextStyle = body.responseStyle;
  }

  const settings = normalizeProofAdminSettings({
    checks: nextChecks,
    responseStyle: nextStyle,
  });

  try {
    await setProofAdminSettings(settings);
    return NextResponse.json(settings);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save" },
      { status: 500 },
    );
  }
}
