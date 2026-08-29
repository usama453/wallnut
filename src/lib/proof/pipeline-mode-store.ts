import "server-only";

import { createAdminClient } from "@/lib/supabase/server";
import {
  proofPipelineModeFromEnv,
  type ProofPipelineMode,
} from "./pipeline-mode";

const SETTING_KEY = "proof_pipeline_mode";

export type { ProofPipelineMode };

export async function getProofPipelineMode(): Promise<ProofPipelineMode> {
  const fromEnv = proofPipelineModeFromEnv();
  if (fromEnv) return fromEnv;

  try {
    const admin = await createAdminClient();
    const { data } = await admin
      .from("platform_settings")
      .select("value")
      .eq("key", SETTING_KEY)
      .maybeSingle();
    if (data?.value === "gemini_only" || data?.value === "split") {
      return data.value;
    }
  } catch {
    // Table may not exist yet before migration runs.
  }

  return "split";
}

export async function setProofPipelineMode(mode: ProofPipelineMode): Promise<void> {
  const admin = await createAdminClient();
  const { error } = await admin.from("platform_settings").upsert(
    {
      key: SETTING_KEY,
      value: mode,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );
  if (error) throw new Error(error.message);
}
