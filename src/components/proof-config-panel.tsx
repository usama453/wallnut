"use client";

import { useCallback, useEffect, useState } from "react";
import { Spinner } from "@/components/wallnut/icons";
import { WALLNUT_PANEL } from "@/components/wallnut/panel";
import {
  DEFAULT_PROOF_ADMIN_SETTINGS,
  PROOF_CHECK_LABELS,
  PROOF_CHECK_TYPES,
  PROOF_RESPONSE_STYLE_LABELS,
  PROOF_RESPONSE_STYLES,
  type ProofAdminSettings,
  type ProofCheckType,
  type ProofResponseStyle,
} from "@/lib/proof/proof-settings";

export function ProofConfigPanel({
  initialSettings = DEFAULT_PROOF_ADMIN_SETTINGS,
}: {
  initialSettings?: ProofAdminSettings;
}) {
  const [settings, setSettings] = useState<ProofAdminSettings>(initialSettings);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/proof-config", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      setSettings({
        checks: { ...DEFAULT_PROOF_ADMIN_SETTINGS.checks, ...data.checks },
        responseStyle: data.responseStyle ?? DEFAULT_PROOF_ADMIN_SETTINGS.responseStyle,
      });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(next: ProofAdminSettings) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/proof-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setSettings({
        checks: { ...DEFAULT_PROOF_ADMIN_SETTINGS.checks, ...data.checks },
        responseStyle: data.responseStyle ?? DEFAULT_PROOF_ADMIN_SETTINGS.responseStyle,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  function toggleCheck(key: ProofCheckType) {
    const next = {
      ...settings,
      checks: { ...settings.checks, [key]: !settings.checks[key] },
    };
    setSettings(next);
    void save(next);
  }

  function selectStyle(style: ProofResponseStyle) {
    if (style === settings.responseStyle) return;
    const next = { ...settings, responseStyle: style };
    setSettings(next);
    void save(next);
  }

  return (
    <article className={WALLNUT_PANEL}>
      <div className="border-b border-[#222] px-4 py-3">
        <h2 className="text-[12px] font-bold text-[#fbfbfb]">Proof checks</h2>
        <p className="mt-1 text-[11px] leading-relaxed text-[#6c6c6c]">
          Choose what Wallnut should look for on the next proof run.
        </p>
      </div>

      <div className="px-4 py-4">
        <div className="grid gap-2 sm:grid-cols-2">
          {PROOF_CHECK_TYPES.map((key) => (
            <label
              key={key}
              className={`flex cursor-pointer items-start gap-3 rounded-[6px] border px-3 py-2.5 transition ${
                settings.checks[key]
                  ? "border-[#3a3a3a] bg-[#181818]"
                  : "border-[#252525] bg-[#121212] opacity-80"
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

        <div className="mt-6 border-t border-[#222] pt-5">
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
                      ? "border-[#3a3a3a] bg-[#202020]"
                      : "border-[#252525] hover:bg-[#181818]"
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
