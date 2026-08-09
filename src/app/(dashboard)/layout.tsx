import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/sidebar";

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  let user = null;
  let profile = null;
  if (supabaseConfigured) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    user = data.user;
    const { data: profileData } = await supabase
      .from("profiles")
      .select("full_name, org_id, organizations(name)")
      .eq("id", user?.id ?? "")
      .maybeSingle();
    profile = profileData;
  }

  const orgName =
    Array.isArray(profile?.organizations) && profile.organizations.length
      ? (profile.organizations as { name: string }[])[0].name
      : "My workspace";

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 items-center justify-between border-b border-slate-800 bg-slate-950/60 px-6">
          <div className="text-sm text-slate-400">{orgName}</div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-400">
              {profile?.full_name ?? user?.email}
            </span>
            <span className="grid size-7 place-items-center rounded-full bg-indigo-500/20 text-xs font-semibold text-indigo-300">
              {(profile?.full_name?.[0] ?? user?.email?.[0] ?? "?").toUpperCase()}
            </span>
          </div>
        </header>
        <main className="thin-scroll flex-1 overflow-y-auto px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
