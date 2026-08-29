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

export async function getProofAdminSettings(): Promise<ProofAdminSettings> {
  try {
    const admin = await createAdminClient();
    const { data } = await admin
      .from("platform_settings")
      .select("key, value")
      .in("key", [CHECKS_KEY, RESPONSE_STYLE_KEY]);

    const byKey = new Map((data ?? []).map((row) => [row.key, row.value]));
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
    return { ...DEFAULT_PROOF_ADMIN_SETTINGS, checks: { ...DEFAULT_PROOF_ADMIN_SETTINGS.checks } };
  }
}

export async function getProofChecks(): Promise<ProofChecksConfig> {
  const settings = await getProofAdminSettings();
  return settings.checks;
}

export async function getProofResponseStyle(): Promise<ProofResponseStyle> {
  const settings = await getProofAdminSettings();
  return settings.responseStyle;
}

export async function setProofAdminSettings(
  settings: ProofAdminSettings,
): Promise<void> {
  const admin = await createAdminClient();
  const normalized = normalizeProofAdminSettings(settings);
  const now = new Date().toISOString();
  const { error } = await admin.from("platform_settings").upsert(
    [
      {
        key: CHECKS_KEY,
        value: JSON.stringify(normalized.checks),
        updated_at: now,
      },
      {
        key: RESPONSE_STYLE_KEY,
        value: normalized.responseStyle,
        updated_at: now,
      },
    ],
    { onConflict: "key" },
  );
  if (error) throw new Error(error.message);
}
