import { redirect } from "next/navigation";
import { Rankings } from "@/components/rankings";
import { createClient } from "@/lib/supabase/server";
import { getStats } from "@/lib/stats";

export const dynamic = "force-dynamic";

export default async function StatsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const stats = await getStats();
  if (!stats) redirect("/");

  return (
    <Rankings
      orgName={stats.orgName}
      byTypos={stats.byTypos}
      byUploads={stats.byUploads}
      totals={stats.totals}
    />
  );
}
