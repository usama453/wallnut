"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_PROOF_ADMIN_SETTINGS,
  depthToChecks,
  type ProofAdminSettings,
  type ProofCheckType,
  type ProofResponseStyle,
} from "@/lib/proof/proof-settings";
import type { ProofPipelineMode } from "@/lib/proof/pipeline-mode";

export function useProofConfig(
  orgSlug: string,
  initialSettings = DEFAULT_PROOF_ADMIN_SETTINGS,
  initialPipelineMode: ProofPipelineMode = "split",
) {
  const [settings, setSettings] = useState<ProofAdminSettings>(initialSettings);
  const [pipelineMode, setPipelineMode] = useState<ProofPipelineMode>(initialPipelineMode);
  const [envLocked, setEnvLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const apiUrl = `/api/settings/proof-config?org=${encodeURIComponent(orgSlug)}`;
  const pipelineUrl = `/api/settings/proof-pipeline?org=${encodeURIComponent(orgSlug)}`;

  const load = useCallback(async () => {
    try {
      const [configRes, pipelineRes] = await Promise.all([
        fetch(apiUrl, { cache: "no-store" }),
        fetch(pipelineUrl, { cache: "no-store" }),
      ]);
      const data = await configRes.json();
      if (!configRes.ok) throw new Error(data.error ?? "Failed to load");
      setSettings({
        checks: { ...DEFAULT_PROOF_ADMIN_SETTINGS.checks, ...data.checks },
        responseStyle: data.responseStyle ?? DEFAULT_PROOF_ADMIN_SETTINGS.responseStyle,
        allowSlangRomanUrdu: data.allowSlangRomanUrdu === true,
      });
      if (pipelineRes.ok) {
        const pipeline = await pipelineRes.json();
        if (pipeline.mode === "split" || pipeline.mode === "gemini_only") {
          setPipelineMode(pipeline.mode);
        }
        setEnvLocked(Boolean(pipeline.envLocked));
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoaded(true);
    }
  }, [apiUrl, pipelineUrl]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(async (next: ProofAdminSettings) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...next, org: orgSlug }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setSettings({
        checks: { ...DEFAULT_PROOF_ADMIN_SETTINGS.checks, ...data.checks },
        responseStyle: data.responseStyle ?? DEFAULT_PROOF_ADMIN_SETTINGS.responseStyle,
        allowSlangRomanUrdu: data.allowSlangRomanUrdu === true,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }, [apiUrl, orgSlug]);

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

  function setCheckDepth(depth: number) {
    const checks = depthToChecks(depth);
    const next = { ...settings, checks };
    setSettings(next);
    void save(next);
  }

  function toggleRomanUrdu() {
    const next = {
      ...settings,
      allowSlangRomanUrdu: !settings.allowSlangRomanUrdu,
    };
    setSettings(next);
    void save(next);
  }

  async function selectPipeline(mode: ProofPipelineMode) {
    if (mode === pipelineMode || envLocked) return;
    setPipelineMode(mode);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(pipelineUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, org: orgSlug }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
    } catch (e) {
      setPipelineMode(pipelineMode);
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  return {
    settings,
    pipelineMode,
    envLocked,
    busy,
    error,
    loaded,
    toggleCheck,
    selectStyle,
    setCheckDepth,
    toggleRomanUrdu,
    selectPipeline,
  };
}
