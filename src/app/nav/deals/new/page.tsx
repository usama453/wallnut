"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createDeal } from "@/lib/sales/actions";
import { STAGES } from "@/lib/sales/stages";

export default function NewDealPage() {
  const router = useRouter();
  const [company, setCompany] = useState("");
  const [contact, setContact] = useState("");
  const [role, setRole] = useState("");
  const [value, setValue] = useState("");
  const [stage, setStage] = useState("discovery");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!company.trim()) return;
    setError(null);
    startTransition(async () => {
      try {
        const { id } = await createDeal({
          company_name: company,
          contact_name: contact || undefined,
          contact_role: role || undefined,
          deal_value: value ? Number(value) : undefined,
          stage,
        });
        router.push(`/nav/deals/${id}`);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not create deal");
      }
    });
  };

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">New deal</h1>
        <p className="mt-1 text-sm text-slate-500">
          Start with what you know now — the AI fills in the rest from transcripts.
        </p>
      </div>

      <form onSubmit={submit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6">
        <Field label="Company name *">
          <input
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="Acme Corp"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Contact / champion">
            <input
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="Sarah Khan"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
            />
          </Field>
          <Field label="Their role">
            <input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="VP Marketing"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Deal value (USD)">
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              type="number"
              min={0}
              placeholder="75000"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
            />
          </Field>
          <Field label="Current stage">
            <select
              value={stage}
              onChange={(e) => setStage(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
            >
              {STAGES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-xl px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-900"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!company.trim() || pending}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pending ? "Creating…" : "Create deal"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}