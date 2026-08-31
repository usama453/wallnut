"use client";

import { useCallback, useEffect, useState } from "react";
import { Spinner } from "@/components/wallnut/icons";
import { WALLNUT_PANEL } from "@/components/wallnut/panel";
import type { ProofPipelineMode } from "@/lib/proof/pipeline-mode";

export function ProofPipelineToggle({
  orgSlug,
  initialMode,
}: {
  orgSlug: string;
  initialMode: ProofPipelineMode;
}) {
  const [mode, setMode] = useState<ProofPipelineMode>(initialMode);
  const [envLocked, setEnvLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apiUrl = `/api/settings/proof-pipeline?org=${encodeURIComponent(orgSlug)}`;

  const load = useCallback(async () => {
    try {
      const res = await fetch(apiUrl, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      if (data.mode === "split" || data.mode === "gemini_only") setMode(data.mode);
      setEnvLocked(Boolean(data.envLocked));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }, [apiUrl]);

  useEffect(() => {
    void load();
  }, [load]);

  async function select(next: ProofPipelineMode) {
    if (busy || envLocked || next === mode) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: next, org: orgSlug }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setMode(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className={WALLNUT_PANEL}>
      <div className="border-b border-[#222222] px-4 py-3">
        <h2 className="text-[12px] font-bold text-[#fbfbfb]">Proof pipeline</h2>
        <p className="mt-1 text-[11px] leading-relaxed text-[#6c6c6c]">
          Compare Wallnut&apos;s split pipeline against Gemini-only proofing. Settings apply to
          this organization only.
        </p>
      </div>

      <div className="px-4 py-4">
        <div className="flex overflow-hidden rounded-[6px] border border-[#222222] text-[11px]">
          <PipelineOption
            active={mode === "split"}
            disabled={busy || envLocked}
            onClick={() => void select("split")}
            title="Split pipeline"
            description="Transcribe → QA → local spellcheck"
          />
          <PipelineOption
            active={mode === "gemini_only"}
            disabled={busy || envLocked}
            onClick={() => void select("gemini_only")}
            title="Gemini only"
            description="One direct prompt — no proof checks"
            borderLeft
          />
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
        ) : null}

        {envLocked ? (
          <p className="mt-3 text-[11px] text-[#6c6c6c]">
            Locked by <code className="text-[#bdbdbd]">PROOF_PIPELINE_MODE</code> in the
            environment.
          </p>
        ) : (
          <p className="mt-3 text-[11px] leading-relaxed text-[#555]">
            Active mode applies to the next proof (upload or WhatsApp). Reports store the mode in{" "}
            <code className="text-[#6c6c6c]">proofs.raw.pipeline_mode</code>.
          </p>
        )}
      </div>
    </article>
  );
}

function PipelineOption({
  active,
  disabled,
  onClick,
  title,
  description,
  borderLeft = false,
}: {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  title: string;
  description: string;
  borderLeft?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`min-w-0 flex-1 px-3 py-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
        borderLeft ? "border-l border-[#222222]" : ""
      } ${active ? "bg-[#0d0d0d]" : "hover:bg-[#0c0c0c]"}`}
    >
      <span className={`block text-[12px] ${active ? "font-bold text-white" : "text-[#bdbdbd]"}`}>
        {title}
      </span>
      <span className="mt-0.5 block text-[10px] text-[#555]">{description}</span>
    </button>
  );
}
