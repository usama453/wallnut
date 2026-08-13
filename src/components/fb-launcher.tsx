"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const FB_APP_ID = process.env.NEXT_PUBLIC_FB_APP_ID ?? "";
const GRAPH_API_VERSION = process.env.FB_GRAPH_API_VERSION ?? "v24.0";
const TP_CONFIG_ID = process.env.NEXT_PUBLIC_TP_CONFIG_ID ?? "";

const ES_CONFIG = JSON.stringify({
  config_id: TP_CONFIG_ID,
  response_type: "code",
  override_default_response_type: true,
  extras: {
    sessionInfoVersion: "3",
    version: "4",
    featureType: "whatsapp_business_onboarding",
    features: [{ name: "whatsapp_business_app_onboarding" }],
  },
});

interface SessionInfoData {
  waba_id?: string;
  business_id?: string;
  phone_number_id?: string;
  page_ids?: string[];
  ad_account_ids?: string[];
  dataset_ids?: string[];
  catalog_ids?: string[];
  instagram_account_ids?: string[];
}
interface SessionInfo {
  data: SessionInfoData;
}

export function FbLauncher({ orgId }: { orgId?: string | null }) {
  const [banner, setBanner] = useState("");
  const [busy, setBusy] = useState(false);
  const esInProgress = useRef(false);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const popupRef = useRef<Window | null>(null);
  const sessionInfoRef = useRef<SessionInfo | null>(null);
  const codeRef = useRef<string | null>(null);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const clearEs = useCallback(() => {
    esInProgress.current = false;
    popupRef.current = null;
    stopPolling();
  }, [stopPolling]);

  useEffect(() => {
    const initFb = () => {
      (window as any).FB.init({
        appId: FB_APP_ID,
        autoLogAppEvents: true,
        xfbml: true,
        version: GRAPH_API_VERSION,
      });
    };
    if (typeof (window as any).FB !== "undefined") initFb();
    else (window as any).fbAsyncInit = initFb;

    const onMessage = (event: MessageEvent) => {
      if (!event.origin.endsWith("facebook.com")) return;
      try {
        const data = JSON.parse(event.data);
        if (data.type === "WA_EMBEDDED_SIGNUP") {
          if (data.data?.current_step) {
            clearEs();
            setBanner("");
          } else {
            const sessionInfo = data as SessionInfo;
            sessionInfoRef.current = sessionInfo;
            if (codeRef.current) handleSaveToken(codeRef.current, sessionInfo);
          }
        }
      } catch {
        // non-ES iframe messages are expected; ignore
      }
    };
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSaveToken = async (code: string, sessionInfo: SessionInfo) => {
    setBanner("Setting up your WhatsApp Business Account...");
    setBusy(true);
    const d = sessionInfo.data ?? {};
    const filterIds = (ids?: string[]) => (ids ?? []).filter((id) => id && id.trim() !== "");
    try {
      const res = await fetch("/api/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          app_id: FB_APP_ID,
          waba_id: d.waba_id,
          waba_ids: d.waba_id ? [d.waba_id] : [],
          business_id: d.business_id,
          phone_number_id: d.phone_number_id,
          page_ids: d.page_ids ?? [],
          ad_account_ids: d.ad_account_ids ?? [],
          dataset_ids: filterIds(d.dataset_ids),
          catalog_ids: filterIds(d.catalog_ids),
          instagram_account_ids: filterIds(d.instagram_account_ids),
          es_option_reg: true,
          es_option_sub: true,
          org_id: orgId ?? undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "setup failed");
      const opLines = (body.operations ?? [])
        .map((op: any) => `${op.ok ? "✓" : "✗"} ${op.name}${op.ok ? "" : `: ${op.detail ?? ""}`}`)
        .join("\n");
      setBanner(`Connected WABA ${body.wabaId}\n${opLines}`);
    } catch (err) {
      setBanner("Setup failed: " + (err instanceof Error ? err.message : "Unknown error"));
    } finally {
      setBusy(false);
    }
  };

  const launch = () => {
    if (!TP_CONFIG_ID) {
      setBanner("Tech Provider Configuration is not configured yet (NEXT_PUBLIC_TP_CONFIG_ID).");
      return;
    }
    if (typeof (window as any).FB === "undefined") {
      setBanner("Facebook SDK is still loading — try again in a moment.");
      return;
    }
    setBanner("Starting Embedded Signup...");
    sessionInfoRef.current = null;
    codeRef.current = null;
    esInProgress.current = true;
    popupRef.current = null;

    const originalOpen = window.open;
    window.open = function (...args: any[]) {
      const popup = originalOpen.apply(window, args as [any]);
      if (popup) popupRef.current = popup;
      window.open = originalOpen;
      return popup;
    };

    (window as any).FB.login(
      (response: any) => {
        clearEs();
        if (response?.authResponse?.code) {
          codeRef.current = response.authResponse.code;
          if (codeRef.current && sessionInfoRef.current) {
            handleSaveToken(codeRef.current, sessionInfoRef.current);
          }
        } else {
          setBanner("");
        }
      },
      JSON.parse(ES_CONFIG),
    );

    stopPolling();
    pollTimerRef.current = setInterval(() => {
      if (!esInProgress.current) {
        stopPolling();
        return;
      }
      const popup = popupRef.current;
      if (popup && popup.closed) {
        clearEs();
        setBanner("");
      }
    }, 500);
  };

  return (
    <div className="space-y-3">
      <button
        onClick={launch}
        disabled={busy}
        className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#1877F2] px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-[#1565C0] hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "Setting up…" : "Connect WhatsApp with Facebook"}
      </button>
      {banner && (
        <pre className="whitespace-pre-wrap rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-xs text-slate-300">
          {banner}
        </pre>
      )}
    </div>
  );
}
