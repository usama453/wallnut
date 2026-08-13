"use client";

import { useCallback, useEffect, useState } from "react";

interface PhoneRow {
  phone_number_id: string;
  display_phone: string | null;
  waba_id: string | null;
  last_updated: string | null;
}

type Step = "idle" | "code_requested" | "registering";

export default function VerifyPhonePage() {
  const [phones, setPhones] = useState<PhoneRow[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<Step>("idle");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/phones");
    const body = await res.json();
    setPhones(body.phones ?? []);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const call = async (payload: Record<string, unknown>) => {
    const res = await fetch("/api/phones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? "request failed");
    return body;
  };

  const requestCode = async () => {
    if (!selected) return;
    setBusy(true);
    setStatus(null);
    try {
      await call({ action: "request-code", phoneNumberId: selected });
      setStep("code_requested");
      setStatus({ ok: true, text: "Code sent via SMS to your business phone." });
    } catch (err) {
      setStatus({ ok: false, text: err instanceof Error ? err.message : "failed" });
    } finally {
      setBusy(false);
    }
  };

  const verifyAndRegister = async () => {
    if (!selected || !otp.trim()) return;
    setBusy(true);
    setStatus(null);
    try {
      await call({ action: "verify-code", phoneNumberId: selected, code: otp.trim() });
      setStep("registering");
      await call({ action: "register", phoneNumberId: selected });
      setStatus({ ok: true, text: "Phone number verified and registered. It can now send WhatsApp messages." });
      setStep("idle");
    } catch (err) {
      setStatus({ ok: false, text: err instanceof Error ? err.message : "failed" });
      setStep("idle");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Verify phone number</h1>
        <p className="mt-1 text-sm text-slate-400">
          WhatsApp requires numbers to be verified before they can send messages.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
        <label className="text-sm font-medium text-slate-200">Connected phone numbers</label>
        <select
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value);
            setStep("idle");
            setStatus(null);
          }}
          className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
        >
          <option value="">Select a number…</option>
          {phones.map((p) => (
            <option key={p.phone_number_id} value={p.phone_number_id}>
              {p.display_phone ? `+${p.display_phone}` : p.phone_number_id}
            </option>
          ))}
        </select>

        {phones.length === 0 && (
          <p className="mt-3 text-xs text-slate-500">
            No connected numbers yet. Connect a WhatsApp Business Account first.
          </p>
        )}

        <div className="mt-5 space-y-4">
          {step === "idle" && (
            <button
              onClick={requestCode}
              disabled={!selected || busy}
              className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Requesting…" : "Request verification code"}
            </button>
          )}

          {step === "code_requested" && (
            <div className="space-y-3">
              <input
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                placeholder="6-digit code"
                maxLength={6}
                inputMode="numeric"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
              />
              <div className="flex gap-2">
                <button
                  onClick={verifyAndRegister}
                  disabled={!otp.trim() || busy}
                  className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? "Verifying…" : "Verify & register"}
                </button>
                <button
                  onClick={() => {
                    setStep("idle");
                    setStatus(null);
                  }}
                  className="rounded-lg px-4 py-2 text-sm text-slate-400 hover:text-slate-200"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {status && (
          <p className={`mt-4 text-sm ${status.ok ? "text-emerald-400" : "text-red-400"}`}>{status.text}</p>
        )}
      </div>
    </div>
  );
}
