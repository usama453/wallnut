"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_PROOF_ADMIN_SETTINGS,
  type ProofAdminSettings,
  type ProofCheckType,
  type ProofResponseStyle,
} from "@/lib/proof/proof-settings";

export function useProofConfig(initialSettings = DEFAULT_PROOF_ADMIN_SETTINGS) {
  const [settings, setSettings] = useState<ProofAdminSettings>(initialSettings);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

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
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(async (next: ProofAdminSettings) => {
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
  }, []);

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

  return {
    settings,
    busy,
    error,
    loaded,
    toggleCheck,
    selectStyle,
  };
}
