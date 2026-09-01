import "server-only";

import { createAdminClient } from "@/lib/supabase/server";
import {
  DEFAULT_PROOF_ADMIN_SETTINGS,
  normalizeProofAdminSettings,
  normalizeProofChecks,
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

    return normalizeProofAdminSettings({
      checks,
      responseStyle: responseStyleRaw,
    });
  } catch {
    return null;
  }
}

function cloneDefaults(): ProofAdminSettings {
  return {
    checks: { ...DEFAULT_PROOF_ADMIN_SETTINGS.checks },
    responseStyle: DEFAULT_PROOF_ADMIN_SETTINGS.responseStyle,
    allowSlangRomanUrdu: DEFAULT_PROOF_ADMIN_SETTINGS.allowSlangRomanUrdu,
  };
}

async function getBrandRomanUrduSetting(
  admin: Awaited<ReturnType<typeof createAdminClient>>,
  orgId: string,
): Promise<boolean> {
  const { data } = await admin
    .from("brand_profiles")
    .select("allow_slang_roman_urdu")
    .eq("org_id", orgId)
    .maybeSingle();
  return data?.allow_slang_roman_urdu === true;
}

async function setBrandRomanUrduSetting(
  admin: Awaited<ReturnType<typeof createAdminClient>>,
  orgId: string,
  enabled: boolean,
): Promise<void> {
  const { data: existing } = await admin
    .from("brand_profiles")
    .select("id")
    .eq("org_id", orgId)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await admin
      .from("brand_profiles")
      .update({ allow_slang_roman_urdu: enabled, updated_at: new Date().toISOString() })
      .eq("org_id", orgId);
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await admin.from("brand_profiles").insert({
    org_id: orgId,
    allow_slang_roman_urdu: enabled,
  });
  if (error) throw new Error(error.message);
}

export async function getProofAdminSettings(orgId: string): Promise<ProofAdminSettings> {
  try {
    const admin = await createAdminClient();
    const allowSlangRomanUrdu = await getBrandRomanUrduSetting(admin, orgId);
    const { data } = await admin
      .from("org_proof_settings")
      .select("checks, response_style")
      .eq("org_id", orgId)
      .maybeSingle();

    if (data) {
      return normalizeProofAdminSettings({
        checks: data.checks,
        responseStyle: data.response_style,
        allowSlangRomanUrdu,
      });
    }

    const legacy = await getLegacyPlatformSettings();
    return {
      ...(legacy ?? cloneDefaults()),
      allowSlangRomanUrdu,
    };
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
  const now = new Date().toISOString();
  const { error } = await admin.from("org_proof_settings").upsert(
    {
      org_id: orgId,
      checks: normalized.checks,
      response_style: normalized.responseStyle,
      pipeline_mode: "gemini_only",
      updated_at: now,
    },
    { onConflict: "org_id" },
  );
  if (error) throw new Error(error.message);
  await setBrandRomanUrduSetting(admin, orgId, normalized.allowSlangRomanUrdu);
}
