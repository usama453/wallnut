"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_PROOF_ADMIN_SETTINGS,
  depthToChecks,
  type ProofAdminSettings,
  type ProofCheckType,
  type ProofResponseStyle,
} from "@/lib/proof/proof-settings";

export function useProofConfig(orgSlug: string, initialSettings = DEFAULT_PROOF_ADMIN_SETTINGS) {
  const [settings, setSettings] = useState<ProofAdminSettings>(initialSettings);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const apiUrl = `/api/settings/proof-config?org=${encodeURIComponent(orgSlug)}`;

  const load = useCallback(async () => {
    try {
      const res = await fetch(apiUrl, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      setSettings({
        checks: { ...DEFAULT_PROOF_ADMIN_SETTINGS.checks, ...data.checks },
        responseStyle: data.responseStyle ?? DEFAULT_PROOF_ADMIN_SETTINGS.responseStyle,
        allowSlangRomanUrdu: data.allowSlangRomanUrdu === true,
      });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoaded(true);
    }
  }, [apiUrl]);

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

  return {
    settings,
    busy,
    error,
    loaded,
    toggleCheck,
    selectStyle,
    setCheckDepth,
    toggleRomanUrdu,
  };
}
