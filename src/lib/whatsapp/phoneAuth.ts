import { createClient, createAdminClient } from "@/lib/supabase/server";

/**
 * Resolve the provider access token for a phone number owned by the current
 * user's org. Throws on missing auth or cross-org access.
 */
export async function getOrgPhoneAccess(phoneNumberId: string): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .maybeSingle();
  const orgId = profile?.org_id;

  const { data: phone } = await supabase
    .from("provider_phones")
    .select("access_token, org_id")
    .eq("phone_number_id", phoneNumberId)
    .maybeSingle();

  if (!phone?.access_token) throw new Error("Phone number not connected");
  if (orgId && phone.org_id && orgId !== phone.org_id) throw new Error("Unauthorized");
  return phone.access_token;
}

/** Service-role lookup of a phone row (for the webhook path where no session exists). */
export async function getPhoneByNumberId(phoneNumberId: string) {
  const admin = await createAdminClient();
  const { data } = await admin
    .from("provider_phones")
    .select("phone_number_id, waba_id, org_id, access_token, display_phone")
    .eq("phone_number_id", phoneNumberId)
    .maybeSingle();
  return data;
}
