"use client";

import Link from "next/link";
import { Spinner } from "@/components/wallnut/icons";
import { WALLNUT_PANEL } from "@/components/wallnut/panel";
import {
  DEFAULT_PROOF_ADMIN_SETTINGS,
  PROOF_CHECK_LABELS,
  PROOF_CHECK_TYPES,
  PROOF_RESPONSE_STYLE_LABELS,
  PROOF_RESPONSE_STYLES,
  type ProofAdminSettings,
} from "@/lib/proof/proof-settings";
import { useProofConfig } from "./use-proof-config";

const CHECK_SHORT_LABELS: Record<(typeof PROOF_CHECK_TYPES)[number], string> = {
  typos: "Typos",
  grammar: "Grammar",
  punctuation: "Punct.",
  capitalization: "Caps",
  consistency: "Consistency",
  readability: "Readability",
  missing_content: "Missing",
};

const STYLE_SHORT_LABELS: Record<(typeof PROOF_RESPONSE_STYLES)[number], string> = {
  plain: "Plain",
  mixed: "Mixed",
  human: "Human",
};

export function ProofConfigWidget({
  initialSettings = DEFAULT_PROOF_ADMIN_SETTINGS,
  showSettingsLink = true,
}: {
  initialSettings?: ProofAdminSettings;
  showSettingsLink?: boolean;
}) {
  const { settings, busy, error, loaded, toggleCheck, selectStyle } =
    useProofConfig(initialSettings);

  if (loaded && error === "Forbidden") return null;

  return (
    <article className={WALLNUT_PANEL}>
      <div className="flex items-start justify-between gap-3 border-b border-[#222] px-3.5 py-2.5">
        <div className="min-w-0">
          <h2 className="text-[11px] font-bold text-[#fbfbfb]">Proof settings</h2>
          <p className="mt-0.5 text-[10px] leading-relaxed text-[#6c6c6c]">
            What to check · how WhatsApp replies read
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {busy ? <Spinner /> : null}
          {showSettingsLink ? (
            <Link
              href="/settings"
              className="text-[10px] text-[#6c6c6c] transition hover:text-[#bdbdbd]"
            >
              Full
            </Link>
          ) : null}
        </div>
      </div>

      <div className="space-y-3 px-3.5 py-3">
        <div className="flex flex-wrap gap-1.5">
          {PROOF_CHECK_TYPES.map((key) => {
            const active = settings.checks[key];
            return (
              <button
                key={key}
                type="button"
                title={PROOF_CHECK_LABELS[key].description}
                disabled={busy}
                onClick={() => toggleCheck(key)}
                className={`rounded-full border px-2.5 py-1 text-[10px] font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  active
                    ? "border-[#3a3a3a] bg-[#202020] text-white"
                    : "border-[#252525] bg-[#121212] text-[#6c6c6c] hover:border-[#333] hover:text-[#bdbdbd]"
                }`}
              >
                {CHECK_SHORT_LABELS[key]}
              </button>
            );
          })}
        </div>

        <div className="flex overflow-hidden rounded-[6px] border border-[#2e2e2e] text-[10px]">
          {PROOF_RESPONSE_STYLES.map((style, index) => {
            const active = settings.responseStyle === style;
            return (
              <button
                key={style}
                type="button"
                title={PROOF_RESPONSE_STYLE_LABELS[style].example}
                disabled={busy}
                onClick={() => selectStyle(style)}
                className={`min-w-0 flex-1 px-2 py-1.5 transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  index > 0 ? "border-l border-[#2e2e2e]" : ""
                } ${active ? "bg-[#202020] font-bold text-white" : "text-[#919191] hover:bg-[#181818]"}`}
              >
                {STYLE_SHORT_LABELS[style]}
              </button>
            );
          })}
        </div>

        {error && error !== "Forbidden" ? (
          <p role="alert" className="text-[10px] text-[#e8b4b4]">
            {error}
          </p>
        ) : (
          <p className="text-[10px] text-[#555]">Applies to the next proof run.</p>
        )}
      </div>
    </article>
  );
}
