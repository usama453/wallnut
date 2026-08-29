import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { TeamManager } from "@/components/team-manager";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role, organizations(name, slug)")
    .eq("id", user?.id ?? "")
    .maybeSingle();

  const organization = Array.isArray(profile?.organizations)
    ? (profile.organizations[0] as { name?: string; slug?: string } | undefined)
    : (profile?.organizations as { name?: string; slug?: string } | null | undefined);
  const orgName = organization?.name ?? "My workspace";
  const orgSlug = organization?.slug ?? null;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Team</h1>
        <p className="text-sm text-slate-400">
          Manage who has access to <span className="text-slate-200">{orgName}</span>.
        </p>
      </div>

      <TeamManager />

      <p className="text-xs text-slate-500">
        Everyone in this workspace sees the same reports. Report links sent via
        WhatsApp remain viewable by anyone with the link.
      </p>

      <Link
        href={orgSlug ? `/${orgSlug}` : "/"}
        className="text-sm text-indigo-400 hover:underline"
      >
        ← Back to workspace
      </Link>
    </div>
  );
}
