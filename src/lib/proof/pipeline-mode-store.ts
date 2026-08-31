import "server-only";

import { createAdminClient } from "@/lib/supabase/server";
import {
  proofPipelineModeFromEnv,
  type ProofPipelineMode,
} from "./pipeline-mode";
import { getProofAdminSettings } from "./proof-settings-store";

const SETTING_KEY = "proof_pipeline_mode";

export type { ProofPipelineMode };

function normalizePipelineMode(value: unknown): ProofPipelineMode | null {
  if (value === "gemini_only" || value === "split") return value;
  return null;
}

async function getLegacyPlatformPipelineMode(): Promise<ProofPipelineMode | null> {
  try {
    const admin = await createAdminClient();
    const { data } = await admin
      .from("platform_settings")
      .select("value")
      .eq("key", SETTING_KEY)
      .maybeSingle();
    return normalizePipelineMode(data?.value);
  } catch {
    return null;
  }
}

export async function getProofPipelineMode(orgId: string): Promise<ProofPipelineMode> {
  const fromEnv = proofPipelineModeFromEnv();
  if (fromEnv) return fromEnv;

  try {
    const admin = await createAdminClient();
    const { data } = await admin
      .from("org_proof_settings")
      .select("pipeline_mode")
      .eq("org_id", orgId)
      .maybeSingle();

    const fromOrg = normalizePipelineMode(data?.pipeline_mode);
    if (fromOrg) return fromOrg;
  } catch {
    // Table or column may not exist yet before migration runs.
  }

  const legacy = await getLegacyPlatformPipelineMode();
  return legacy ?? "split";
}

export async function setProofPipelineMode(
  orgId: string,
  mode: ProofPipelineMode,
): Promise<void> {
  const admin = await createAdminClient();
  const settings = await getProofAdminSettings(orgId);
  const { error } = await admin.from("org_proof_settings").upsert(
    {
      org_id: orgId,
      checks: settings.checks,
      response_style: settings.responseStyle,
      pipeline_mode: mode,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "org_id" },
  );
  if (error) throw new Error(error.message);
}
