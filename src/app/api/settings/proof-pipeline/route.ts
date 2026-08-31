import { NextRequest, NextResponse } from "next/server";
import {
  getProofPipelineMode,
  setProofPipelineMode,
} from "@/lib/proof/pipeline-mode-store";
import type { ProofPipelineMode } from "@/lib/proof/pipeline-mode";
import { requireProofConfigApi } from "@/lib/proof-config-access";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireProofConfigApi(req.nextUrl.searchParams.get("org"));
  if (auth.error) return auth.error;

  const mode = await getProofPipelineMode(auth.orgId);
  const envLocked = Boolean(process.env.PROOF_PIPELINE_MODE?.trim());
  return NextResponse.json({ mode, envLocked });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const auth = await requireProofConfigApi(
    typeof body.org === "string" ? body.org : request.nextUrl.searchParams.get("org"),
  );
  if (auth.error) return auth.error;

  if (process.env.PROOF_PIPELINE_MODE?.trim()) {
    return NextResponse.json(
      { error: "PROOF_PIPELINE_MODE is set in the environment and overrides this toggle." },
      { status: 409 },
    );
  }

  const mode = body.mode as ProofPipelineMode;
  if (mode !== "split" && mode !== "gemini_only") {
    return NextResponse.json({ error: "mode must be split or gemini_only" }, { status: 400 });
  }

  try {
    await setProofPipelineMode(auth.orgId, mode);
    return NextResponse.json({ mode });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save" },
      { status: 500 },
    );
  }
}
