import { createAdminClient } from "@/lib/supabase/server";

export interface WhatsAppConnection {
  accessToken: string;
  phoneId: string;
  /** org the connected phone is bound to (for proof storage). */
  orgId?: string | null;
}

/**
 * Resolve the WhatsApp connection to use for a given phone number id.
 * Multi-tenant: a phone number connected via Embedded Signup has its own token
 * (stored in provider_phones). Falls back to the legacy single-tenant env
 * credentials when the number is not in the provider tables (e.g. the app
 * owner's own number).
 */
export async function resolveConnection(phoneNumberId?: string): Promise<WhatsAppConnection | null> {
  if (phoneNumberId) {
    try {
      const admin = await createAdminClient();
      const { data } = await admin
        .from("provider_phones")
        .select("phone_number_id, access_token, org_id")
        .eq("phone_number_id", phoneNumberId)
        .maybeSingle();
      if (data?.access_token) {
        return {
          accessToken: data.access_token,
          phoneId: String(data.phone_number_id),
          orgId: data.org_id,
        };
      }
    } catch {
      // fall through to env credentials
    }
  }

  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  if (token && phoneId) {
    return { accessToken: token, phoneId, orgId: process.env.WHATSAPP_DEFAULT_ORG_ID };
  }
  return null;
}
