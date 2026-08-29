import "server-only";

import { createAdminClient } from "@/lib/supabase/server";
import { callbackUrl } from "@/lib/auth-origin";

function appOrigin() {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000"
  );
}

/** Email a signup link so the invitee can create a password and join the org. */
export async function sendOrgInviteEmail(
  email: string,
  org: { slug: string; name: string },
) {
  const admin = await createAdminClient();
  const origin = appOrigin();
  const redirectTo = callbackUrl(origin, `/${org.slug}`, org.slug);

  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: {
      invited_org_slug: org.slug,
      invited_org_name: org.name,
    },
  });

  if (error) {
    return { ok: false as const, error: error.message };
  }
  return { ok: true as const };
}
