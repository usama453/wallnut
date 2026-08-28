import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDashboardData } from "@/lib/groups";
import { DashboardGrid } from "@/components/dashboard-grid";
import { WhatsAppGroups } from "@/components/whatsapp-groups";

export const dynamic = "force-dynamic";

export default async function DashboardHome() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const data = await getDashboardData();
  if (!data) redirect("/login");

  return (
    <div className="mx-auto max-w-7xl space-y-10">
      <WhatsAppGroups codes={data.codes} />
      <DashboardGrid
        orgName={data.orgName}
        cards={data.cards}
        stats={data.stats}
      />
    </div>
  );
}
