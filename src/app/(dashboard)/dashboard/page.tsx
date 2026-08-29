import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDashboardData } from "@/lib/groups";
import { DashboardGrid } from "@/components/dashboard-grid";
import { WhatsAppGroups } from "@/components/whatsapp-groups";
import { getStats } from "@/lib/stats";

export const dynamic = "force-dynamic";

export default async function DashboardHome() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const [data, rankings] = await Promise.all([getDashboardData(), getStats()]);
  if (!data || !rankings) redirect("/");

  return (
    <div className="mx-auto max-w-5xl">
      <DashboardGrid
        orgName={data.orgName}
        cards={data.cards}
        stats={data.stats}
        leaders={rankings.byTypos}
      />
      <div className="mx-auto mt-16 max-w-[720px] border-t border-[#1b1b1b] pt-8">
        <WhatsAppGroups codes={data.codes} />
      </div>
    </div>
  );
}
