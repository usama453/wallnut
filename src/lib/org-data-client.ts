import "server-only";

import { createAdminClient, createClient } from "@/lib/supabase/server";

/** Use service role for guest dashboard viewers; otherwise the user session client. */
export async function getOrgScopedClient(isGuest: boolean) {
  if (isGuest) return createAdminClient();
  return createClient();
}
