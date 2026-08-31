import "server-only";

import {
  hashDashboardPassword,
  orgHasDashboardPassword,
} from "@/lib/dashboard-access";
import { createAdminClient } from "@/lib/supabase/server";

export async function getDashboardPasswordConfigured(orgId: string) {
  return orgHasDashboardPassword(orgId);
}

export async function setDashboardPassword(orgId: string, password: string) {
  const trimmed = password.trim();
  if (trimmed.length < 4) {
    throw new Error("Password must be at least 4 characters");
  }

  const admin = await createAdminClient();
  const { error } = await admin
    .from("organizations")
    .update({ dashboard_password_hash: hashDashboardPassword(trimmed) })
    .eq("id", orgId);

  if (error) throw new Error(error.message);
}

export async function clearDashboardPassword(orgId: string) {
  const admin = await createAdminClient();
  const { error } = await admin
    .from("organizations")
    .update({ dashboard_password_hash: null })
    .eq("id", orgId);

  if (error) throw new Error(error.message);
}
