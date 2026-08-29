import { createAdminClient } from "@/lib/supabase/server";

const DEFAULT_SUPER_ADMINS = ["usama@getthenga.com", "xalion.malik@gmail.com"];

export function canCreateWhatsAppGroup(
  role: string | null | undefined,
  isSuperAdmin = false,
) {
  if (isSuperAdmin) return true;
  return role === "owner" || role === "admin" || role === "super_admin";
}

export async function userIsSuperAdmin(
  userId: string,
  email?: string | null,
): Promise<boolean> {
  try {
    const admin = await createAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("is_super_admin")
      .eq("id", userId)
      .maybeSingle();
    if (profile?.is_super_admin === true) return true;

    let resolvedEmail = email?.trim().toLowerCase() ?? "";
    if (!resolvedEmail) {
      const { data } = await admin.auth.admin.getUserById(userId);
      resolvedEmail = data.user?.email?.trim().toLowerCase() ?? "";
    }
    return superAdminEmails().includes(resolvedEmail);
  } catch {
    return superAdminEmails().includes(email?.trim().toLowerCase() ?? "");
  }
}

function superAdminEmails() {
  const extra = (process.env.SUPER_ADMIN_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set([...DEFAULT_SUPER_ADMINS, ...extra])];
}
