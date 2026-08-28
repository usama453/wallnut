import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { TeamManager } from "@/components/team-manager";
import { WhatsAppGroups } from "@/components/whatsapp-groups";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role, organizations(name)")
    .eq("id", user?.id ?? "")
    .maybeSingle();

  const orgName =
    Array.isArray(profile?.organizations) && profile.organizations.length
      ? (profile.organizations as { name: string }[])[0].name
      : "My workspace";

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Team</h1>
        <p className="text-sm text-slate-400">
          Manage who has access to <span className="text-slate-200">{orgName}</span>.
        </p>
      </div>

      <TeamManager />

      <WhatsAppGroups />

      <p className="text-xs text-slate-500">
        Everyone in this workspace sees the same reports. Report links sent via
        WhatsApp remain viewable by anyone with the link.
      </p>

      <Link href="/dashboard" className="text-sm text-indigo-400 hover:underline">
        ← Back to dashboard
      </Link>
    </div>
  );
}
