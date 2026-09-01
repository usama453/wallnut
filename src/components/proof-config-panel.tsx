"use client";

import { Spinner } from "@/components/wallnut/icons";
import { WALLNUT_PANEL } from "@/components/wallnut/panel";
import {
  DEFAULT_PROOF_ADMIN_SETTINGS,
  PROOF_RESPONSE_STYLE_LABELS,
  PROOF_RESPONSE_STYLES,
  type ProofAdminSettings,
} from "@/lib/proof/proof-settings";
import { useProofConfig } from "@/components/proof-config/use-proof-config";

export function ProofConfigPanel({
  orgSlug,
  initialSettings = DEFAULT_PROOF_ADMIN_SETTINGS,
}: {
  orgSlug: string;
  initialSettings?: ProofAdminSettings;
}) {
  const { settings, busy, error, selectStyle } = useProofConfig(orgSlug, initialSettings);

  return (
    <article className={WALLNUT_PANEL}>
      <div className="border-b border-[#222222] px-4 py-3">
        <h2 className="text-[12px] font-bold text-[#fbfbfb]">Proofing</h2>
        <p className="mt-1 text-[11px] leading-relaxed text-[#6c6c6c]">
          Wallnut sends each image or PDF to Gemini in one pass.
        </p>
      </div>

      <div className="px-4 py-4">
        <h3 className="text-[12px] font-bold text-[#fbfbfb]">WhatsApp reply style</h3>
        <p className="mt-1 text-[11px] leading-relaxed text-[#6c6c6c]">
          How Wallnut phrases findings when it messages back on WhatsApp.
        </p>

        <div className="mt-3 flex flex-col gap-2">
          {PROOF_RESPONSE_STYLES.map((style) => {
            const meta = PROOF_RESPONSE_STYLE_LABELS[style];
            const active = settings.responseStyle === style;
            return (
              <button
                key={style}
                type="button"
                disabled={busy}
                onClick={() => selectStyle(style)}
                className={`rounded-[6px] border px-3 py-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  active
                    ? "border-[#2e2e2e] bg-[#0d0d0d]"
                    : "border-[#222222] hover:bg-[#0c0c0c]"
                }`}
              >
                <span className={`block text-[12px] ${active ? "font-bold text-white" : "text-[#bdbdbd]"}`}>
                  {meta.title}
                </span>
                <span className="mt-0.5 block text-[10px] text-[#6c6c6c]">{meta.description}</span>
                <span className="mt-1 block text-[10px] italic text-[#555]">{meta.example}</span>
              </button>
            );
          })}
        </div>

        {busy ? (
          <p className="mt-3 flex items-center gap-2 text-[11px] text-[#6c6c6c]">
            <Spinner /> Saving…
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="mt-3 text-[11px] text-[#e8b4b4]">
            {error}
          </p>
        ) : (
          <p className="mt-3 text-[11px] leading-relaxed text-[#555]">
            Gemini replies with Error / Correction lines, or All good.
          </p>
        )}
      </div>
    </article>
  );
}
