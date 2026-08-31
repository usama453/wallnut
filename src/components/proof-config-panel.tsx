"use client";

import { Spinner } from "@/components/wallnut/icons";
import { WALLNUT_PANEL } from "@/components/wallnut/panel";
import {
  DEFAULT_PROOF_ADMIN_SETTINGS,
  PROOF_CHECK_LABELS,
  PROOF_CHECK_TYPES,
  PROOF_RESPONSE_STYLE_LABELS,
  PROOF_RESPONSE_STYLES,
  ROMAN_URDU_PROOF_LABEL,
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
  const { settings, busy, error, toggleCheck, selectStyle, toggleRomanUrdu } =
    useProofConfig(orgSlug, initialSettings);

  return (
    <article className={WALLNUT_PANEL}>
      <div className="border-b border-[#222222] px-4 py-3">
        <h2 className="text-[12px] font-bold text-[#fbfbfb]">Proof checks</h2>
        <p className="mt-1 text-[11px] leading-relaxed text-[#6c6c6c]">
          Choose what Wallnut should look for on the next proof run. Settings apply to this
          organization only.
        </p>
      </div>

      <div className="px-4 py-4">
        <div className="grid gap-2 sm:grid-cols-2">
          {PROOF_CHECK_TYPES.map((key) => (
            <label
              key={key}
              className={`flex cursor-pointer items-start gap-3 rounded-[6px] border px-3 py-2.5 transition ${
                settings.checks[key]
                  ? "border-[#2e2e2e] bg-[#0c0c0c]"
                  : "border-[#222222] bg-[#050505] opacity-80"
              }`}
            >
              <input
                type="checkbox"
                className="mt-0.5"
                checked={settings.checks[key]}
                disabled={busy}
                onChange={() => toggleCheck(key)}
              />
              <span className="min-w-0">
                <span className="block text-[12px] font-medium text-[#fbfbfb]">
                  {PROOF_CHECK_LABELS[key].title}
                </span>
                <span className="mt-0.5 block text-[10px] leading-relaxed text-[#6c6c6c]">
                  {PROOF_CHECK_LABELS[key].description}
                </span>
              </span>
            </label>
          ))}
        </div>

        <div className="mt-6 border-t border-[#222222] pt-5">
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
        </div>

        <div className="mt-6 border-t border-[#222222] pt-5">
          <h3 className="text-[12px] font-bold text-[#fbfbfb]">{ROMAN_URDU_PROOF_LABEL.title}</h3>
          <p className="mt-1 text-[11px] leading-relaxed text-[#6c6c6c]">
            {ROMAN_URDU_PROOF_LABEL.description}
          </p>
          <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-[6px] border border-[#222222] px-3 py-2.5 transition hover:bg-[#0c0c0c]">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={settings.allowSlangRomanUrdu}
              disabled={busy}
              onChange={() => toggleRomanUrdu()}
            />
            <span className="min-w-0">
              <span className="block text-[12px] font-medium text-[#fbfbfb]">
                Allow Roman Urdu &amp; slang
              </span>
              <span className="mt-0.5 block text-[10px] leading-relaxed text-[#6c6c6c]">
                When on, Wallnut won&apos;t flag casual Roman Urdu spellings in WhatsApp replies.
              </span>
            </span>
          </label>
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
            Changes apply to the next proof. Enabled checks are stored on each report in{" "}
            <code className="text-[#6c6c6c]">proofs.raw.enabled_checks</code>.
          </p>
        )}
      </div>
    </article>
  );
}
