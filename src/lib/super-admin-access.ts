import "server-only";

import { redirect } from "next/navigation";
import { getAuthedOrgSlug } from "@/lib/org-access";
import { createClient } from "@/lib/supabase/server";
import { userIsSuperAdmin } from "@/lib/roles";
import { orgHomePath } from "@/lib/org-paths";

export async function requireSuperAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");
  if (!(await userIsSuperAdmin(user.id, user.email))) {
    const slug = await getAuthedOrgSlug();
    redirect(slug ? orgHomePath(slug) : "/");
  }
  return user;
}
