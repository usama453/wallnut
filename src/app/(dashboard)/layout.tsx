import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/wallnut/app-header";
import { listUserMemberships } from "@/lib/org-membership";
import { userIsSuperAdmin } from "@/lib/roles";

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  if (!supabaseConfigured) redirect("/");

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) redirect("/");

  const isSuperAdmin = await userIsSuperAdmin(user.id, user.email);
  if (!isSuperAdmin) redirect("/");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, org_id, organizations(name, slug)")
    .eq("id", user.id)
    .maybeSingle();

  const organization = Array.isArray(profile?.organizations)
    ? (profile.organizations[0] as { name?: string; slug?: string } | undefined)
    : (profile?.organizations as { name?: string; slug?: string } | null | undefined);
  const memberships = user ? await listUserMemberships(user.id) : [];
  const active =
    memberships.find((membership) => membership.slug === organization?.slug)
    ?? memberships[0]
    ?? null;
  const orgName = active?.name ?? organization?.name ?? "My workspace";
  const orgSlug = active?.slug ?? organization?.slug ?? null;

  return (
    <div className="min-h-screen bg-black text-[#fbfbfb]">
      <AppHeader
        authenticated
        orgName={orgName}
        orgSlug={orgSlug}
        userName={profile?.full_name}
        userEmail={user.email}
        memberships={memberships.map((membership) => ({
          name: membership.name,
          slug: membership.slug,
          role: membership.role,
        }))}
        isSuperAdmin={isSuperAdmin}
      />
      <main className="min-h-[calc(100vh-3.5rem)] px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
