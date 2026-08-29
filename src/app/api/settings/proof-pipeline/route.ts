import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getProofPipelineMode,
  setProofPipelineMode,
} from "@/lib/proof/pipeline-mode-store";
import type { ProofPipelineMode } from "@/lib/proof/pipeline-mode";
import { userIsSuperAdmin } from "@/lib/roles";

export const dynamic = "force-dynamic";

async function requireSuperAdminApi() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  }
  if (!(await userIsSuperAdmin(user.id, user.email))) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { error: null };
}

export async function GET() {
  const auth = await requireSuperAdminApi();
  if (auth.error) return auth.error;

  const mode = await getProofPipelineMode();
  const envLocked = Boolean(process.env.PROOF_PIPELINE_MODE?.trim());
  return NextResponse.json({ mode, envLocked });
}

export async function POST(request: NextRequest) {
  const auth = await requireSuperAdminApi();
  if (auth.error) return auth.error;

  if (process.env.PROOF_PIPELINE_MODE?.trim()) {
    return NextResponse.json(
      { error: "PROOF_PIPELINE_MODE is set in the environment and overrides this toggle." },
      { status: 409 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const mode = body.mode as ProofPipelineMode;
  if (mode !== "split" && mode !== "gemini_only") {
    return NextResponse.json({ error: "mode must be split or gemini_only" }, { status: 400 });
  }

  try {
    await setProofPipelineMode(mode);
    return NextResponse.json({ mode });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save" },
      { status: 500 },
    );
  }
}
