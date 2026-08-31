import "server-only";

import { createAdminClient } from "@/lib/supabase/server";
import {
  DEFAULT_PROOF_ADMIN_SETTINGS,
  normalizeProofAdminSettings,
  normalizeProofChecks,
  normalizeProofResponseStyle,
  type ProofAdminSettings,
  type ProofChecksConfig,
  type ProofResponseStyle,
} from "./proof-settings";

const CHECKS_KEY = "proof_enabled_checks";
const RESPONSE_STYLE_KEY = "proof_response_style";

async function getLegacyPlatformSettings(): Promise<ProofAdminSettings | null> {
  try {
    const admin = await createAdminClient();
    const { data } = await admin
      .from("platform_settings")
      .select("key, value")
      .in("key", [CHECKS_KEY, RESPONSE_STYLE_KEY]);

    if (!data?.length) return null;

    const byKey = new Map(data.map((row) => [row.key, row.value]));
    const checksRaw = byKey.get(CHECKS_KEY);
    const responseStyleRaw = byKey.get(RESPONSE_STYLE_KEY);

    let checks = DEFAULT_PROOF_ADMIN_SETTINGS.checks;
    if (checksRaw) {
      try {
        checks = normalizeProofChecks(JSON.parse(checksRaw));
      } catch {
        checks = DEFAULT_PROOF_ADMIN_SETTINGS.checks;
      }
    }

    return {
      checks,
      responseStyle: normalizeProofResponseStyle(responseStyleRaw),
    };
  } catch {
    return null;
  }
}

function cloneDefaults(): ProofAdminSettings {
  return {
    checks: { ...DEFAULT_PROOF_ADMIN_SETTINGS.checks },
    responseStyle: DEFAULT_PROOF_ADMIN_SETTINGS.responseStyle,
  };
}

export async function getProofAdminSettings(orgId: string): Promise<ProofAdminSettings> {
  try {
    const admin = await createAdminClient();
    const { data } = await admin
      .from("org_proof_settings")
      .select("checks, response_style")
      .eq("org_id", orgId)
      .maybeSingle();

    if (data) {
      return normalizeProofAdminSettings({
        checks: data.checks,
        responseStyle: data.response_style,
      });
    }

    const legacy = await getLegacyPlatformSettings();
    return legacy ?? cloneDefaults();
  } catch {
    return cloneDefaults();
  }
}

export async function getProofChecks(orgId: string): Promise<ProofChecksConfig> {
  const settings = await getProofAdminSettings(orgId);
  return settings.checks;
}

export async function getProofResponseStyle(orgId: string): Promise<ProofResponseStyle> {
  const settings = await getProofAdminSettings(orgId);
  return settings.responseStyle;
}

export async function setProofAdminSettings(
  orgId: string,
  settings: ProofAdminSettings,
): Promise<void> {
  const admin = await createAdminClient();
  const normalized = normalizeProofAdminSettings(settings);
  const { data: existing } = await admin
    .from("org_proof_settings")
    .select("pipeline_mode")
    .eq("org_id", orgId)
    .maybeSingle();
  const pipelineMode =
    existing?.pipeline_mode === "gemini_only" || existing?.pipeline_mode === "split"
      ? existing.pipeline_mode
      : "split";
  const now = new Date().toISOString();
  const { error } = await admin.from("org_proof_settings").upsert(
    {
      org_id: orgId,
      checks: normalized.checks,
      response_style: normalized.responseStyle,
      pipeline_mode: pipelineMode,
      updated_at: now,
    },
    { onConflict: "org_id" },
  );
  if (error) throw new Error(error.message);
}
