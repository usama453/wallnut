import Link from "next/link";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const aiProvider = process.env.AI_PROVIDER ?? "gemini";
  const model = process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite";
  const whatsAppConfigured = Boolean(
    process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID && process.env.WHATSAPP_VERIFY_TOKEN,
  );
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">Settings</h1>

      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <h2 className="text-sm font-semibold">AI pipeline</h2>
        <p className="mt-1 text-sm text-slate-400">
          Provider: <span className="text-slate-200">{aiProvider === "mock" ? "Mock (offline)" : model}</span>
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Set <code className="text-slate-300">AI_PROVIDER</code> and <code className="text-slate-300">GEMINI_MODEL</code> in your
          environment to swap models without code changes.
        </p>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <h2 className="text-sm font-semibold">WhatsApp Business</h2>
        <p className="mt-1 text-sm text-slate-400">
          Inbound proofing bot: send an image or PDF to your number and get a
          score card back, with Approve / Request changes buttons.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          {whatsAppConfigured ? (
            <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 font-medium text-emerald-300">
              ● Configured
            </span>
          ) : (
            <span className="rounded-full bg-slate-700 px-2.5 py-0.5 font-medium text-slate-300">
              ○ Not configured — set WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, WHATSAPP_VERIFY_TOKEN
            </span>
          )}
          <span className="text-slate-500">
            Webhook URL: <code className="text-slate-300">{`${appUrl}/api/whatsapp/webhook`}</code>
          </span>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <h2 className="text-sm font-semibold">Billing</h2>
        <p className="mt-1 text-sm text-slate-400">Subscriptions and usage-based plans are coming soon.</p>
      </div>

      <Link href="/dashboard" className="text-sm text-indigo-400 hover:underline">
        ← Back to dashboard
      </Link>
    </div>
  );
}
