import Link from "next/link";
import { WahaConnect } from "@/components/waha-connect";
import { createClient } from "@/lib/supabase/server";
import { canCreateWhatsAppGroup, userIsSuperAdmin } from "@/lib/roles";
import { getWahaSessionState } from "@/lib/whatsapp/session";

export const dynamic = "force-dynamic";

export default async function ConnectPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user?.id ?? "")
    .maybeSingle();
  const isSuperAdmin = user
    ? await userIsSuperAdmin(user.id, user.email)
    : false;
  const canManage = canCreateWhatsAppGroup(profile?.role, isSuperAdmin);
  const initialState = await getWahaSessionState(canManage);

  return (
    <main className="mx-auto max-w-3xl space-y-8">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-600">
          WhatsApp · WAHA
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
          Connect WhatsApp
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
          Pair the shared WAHA session by QR code. Wallnut can then receive
          images and PDFs, run a proof, and reply in the same chat.
        </p>
      </div>

      <WahaConnect initialState={initialState} canManage={canManage} />

      <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-zinc-500">
        <Link
          href="/settings"
          className="transition hover:text-white"
        >
          Manage chat access
        </Link>
        <Link
          href="/connect/webhooks"
          className="transition hover:text-white"
        >
          View webhook events
        </Link>
      </div>
    </main>
  );
}
