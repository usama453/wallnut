import Link from "next/link";
import { WhatsAppAccess } from "@/components/whatsapp-access";
import { ProofPipelineToggle } from "@/components/proof-pipeline-toggle";
import { ProofConfigPanel } from "@/components/proof-config-panel";
import { Reveal } from "@/components/wallnut/reveal";
import { WALLNUT_PANEL } from "@/components/wallnut/panel";
import { getProofPipelineMode } from "@/lib/proof/pipeline-mode-store";
import { getProofAdminSettings } from "@/lib/proof/proof-settings-store";
import { requireSuperAdmin } from "@/lib/super-admin-access";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireSuperAdmin();
  const proofPipelineMode = await getProofPipelineMode();
  const proofAdminSettings = await getProofAdminSettings();
  const aiProvider = process.env.AI_PROVIDER ?? "gemini";
  const model = process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite";
  const wahaConfigured = Boolean(
    process.env.WAHA_BASE_URL && process.env.WAHA_API_KEY,
  );
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  return (
    <section className="mx-auto w-full max-w-2xl space-y-4 pb-8 pt-2">
      <Reveal dramatic>
        <header>
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#6c6c6c]">
            Platform admin
          </p>
          <h1 className="mt-2 text-[clamp(26px,4vw,34px)] font-bold leading-tight tracking-[-0.8px] text-white">
            Settings
          </h1>
          <p className="mt-3 max-w-xl text-[13px] leading-relaxed text-[#919191]">
            AI pipeline, WhatsApp access, and platform configuration.
          </p>
        </header>
      </Reveal>

      <Reveal dramatic delayMs={120}>
        <ProofPipelineToggle initialMode={proofPipelineMode} />
      </Reveal>

      <Reveal dramatic delayMs={140}>
        <ProofConfigPanel initialSettings={proofAdminSettings} />
      </Reveal>

      <Reveal dramatic delayMs={160}>
        <article className={WALLNUT_PANEL}>
          <div className="border-b border-[#131313] px-4 py-3">
            <h2 className="text-[12px] font-bold text-[#fbfbfb]">AI pipeline</h2>
          </div>
          <div className="px-4 py-4">
            <p className="text-[12px] text-[#919191]">
              Provider:{" "}
              <span className="text-[#bdbdbd]">
                {aiProvider === "mock" ? "Mock (offline)" : model}
              </span>
            </p>
            <p className="mt-2 text-[11px] leading-relaxed text-[#6c6c6c]">
              Set <code className="text-[#bdbdbd]">AI_PROVIDER</code> and{" "}
              <code className="text-[#bdbdbd]">GEMINI_MODEL</code> in your environment to swap
              models without code changes.
            </p>
          </div>
        </article>
      </Reveal>

      <Reveal dramatic delayMs={200}>
        <article className={WALLNUT_PANEL}>
          <div className="border-b border-[#131313] px-4 py-3">
            <h2 className="text-[12px] font-bold text-[#fbfbfb]">WhatsApp (WAHA)</h2>
          </div>
          <div className="px-4 py-4">
            <p className="text-[12px] leading-relaxed text-[#919191]">
              Inbound proofing bot: send an image or PDF to your number and get a score card
              back, with Approve / Request changes buttons.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {wahaConfigured ? (
                <span className="rounded-full border border-[#1f3d28] bg-[#101a14] px-2.5 py-0.5 text-[11px] font-medium text-[#4ade80]">
                  ● Configured
                </span>
              ) : (
                <span className="rounded-full border border-[#2a2a2a] bg-[#0a0a0a] px-2.5 py-0.5 text-[11px] font-medium text-[#919191]">
                  ○ Not configured
                </span>
              )}
              <span className="text-[11px] text-[#555]">
                Webhook:{" "}
                <code className="text-[#bdbdbd]">{`${appUrl}/api/whatsapp/webhook`}</code>
              </span>
            </div>
          </div>
        </article>
      </Reveal>

      <Reveal dramatic delayMs={260}>
        <WhatsAppAccess />
      </Reveal>

      <Reveal dramatic delayMs={320}>
        <article className={WALLNUT_PANEL}>
          <div className="border-b border-[#131313] px-4 py-3">
            <h2 className="text-[12px] font-bold text-[#fbfbfb]">Billing</h2>
          </div>
          <div className="px-4 py-4">
            <p className="text-[12px] text-[#919191]">
              Subscriptions and usage-based plans are coming soon.
            </p>
          </div>
        </article>
      </Reveal>

      <Reveal dramatic delayMs={380}>
        <Link
          href="/"
          className="inline-block text-[12px] text-[#919191] transition hover:text-white"
        >
          ← Back to organizations
        </Link>
      </Reveal>
    </section>
  );
}
