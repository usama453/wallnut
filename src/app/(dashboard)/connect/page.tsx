import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { FbLauncher } from "@/components/fb-launcher";

export default async function ConnectPage() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;

  let orgId: string | null = null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", userId ?? "")
    .maybeSingle();
  orgId = profile?.org_id ?? null;

  const { data: wabas } = await supabase
    .from("provider_wabas")
    .select("waba_id, business_id, last_updated")
    .eq("org_id", orgId ?? "")
    .order("last_updated", { ascending: false });

  const { data: phones } = await supabase
    .from("provider_phones")
    .select("phone_number_id, display_phone, waba_id, last_updated")
    .eq("org_id", orgId ?? "")
    .order("last_updated", { ascending: false });

  const configId = process.env.NEXT_PUBLIC_TP_CONFIG_ID ?? "";
  const fbAppId = process.env.NEXT_PUBLIC_FB_APP_ID ?? "";

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-white">Connect WhatsApp</h1>
        <p className="mt-1 text-sm text-slate-400">
          Connect your own WhatsApp Business Account so Wallnut proofs incoming messages and
          replies with reports, straight to your phone.
        </p>
      </div>

      {!configId || !fbAppId ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
          <p className="font-medium">Almost ready — one Meta setup step left.</p>
          <p className="mt-1 text-amber-200/80">
            The developer needs to set two environment variables before connections work:{" "}
            <code className="rounded bg-black/30 px-1.5 py-0.5">NEXT_PUBLIC_FB_APP_ID</code> and{" "}
            <code className="rounded bg-black/30 px-1.5 py-0.5">NEXT_PUBLIC_TP_CONFIG_ID</code>.
          </p>
        </div>
      ) : null}

      <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
        <h2 className="text-sm font-semibold text-white">1 · Start with Facebook</h2>
        <p className="mt-1 text-sm text-slate-400">
          A Facebook popup opens to select the WhatsApp Business Account, phone number and page to
          connect. Your access is stored securely and only used for this account.
        </p>
        <div className="mt-4">
          <FbLauncher orgId={orgId} />
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
        <h2 className="text-sm font-semibold text-white">2 · Verify your phone number</h2>
        <p className="mt-1 text-sm text-slate-400">
          WhatsApp will send a 6-digit code to your business phone. Enter it below to register the
          number so it can send messages.
        </p>
        <div className="mt-4">
          <a
            href={`/connect/verify`}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-700"
          >
            Open phone verification
          </a>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
        <h2 className="text-sm font-semibold text-white">3 · Review connections</h2>
        <p className="mt-1 text-sm text-slate-400">WABAs and phone numbers connected to this workspace.</p>

        <div className="mt-4 space-y-3">
          {(wabas ?? []).length === 0 ? (
            <p className="text-sm text-slate-500">No WhatsApp Business Accounts connected yet.</p>
          ) : (
            (wabas ?? []).map((w) => (
              <div key={w.waba_id} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-200">WABA {w.waba_id}</p>
                  <p className="text-xs text-slate-500">Business {w.business_id ?? "—"}</p>
                </div>
                <span className="text-xs text-slate-500">
                  {w.last_updated ? new Date(w.last_updated).toLocaleString() : ""}
                </span>
              </div>
            ))
          )}

          {(phones ?? []).length === 0 ? (
            <p className="text-sm text-slate-500">No phone numbers connected yet.</p>
          ) : (
            (phones ?? []).map((p) => (
              <div key={p.phone_number_id} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-200">
                    {p.display_phone ? `+${p.display_phone}` : `Phone ${p.phone_number_id}`}
                  </p>
                  <p className="text-xs text-slate-500">WABA {p.waba_id}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <p className="text-xs text-slate-500">
        Connecting requires the app to be published (Business Verification + App Review).{" "}
        <Link href="/connect/verify" className="text-slate-400 underline underline-offset-2">
          Verify phone
        </Link>{" "}
        ·{" "}
        <Link href="/connect/webhooks" className="text-slate-400 underline underline-offset-2">
          Webhook viewer
        </Link>
      </p>
    </div>
  );
}
