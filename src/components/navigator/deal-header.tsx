"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateDeal } from "@/lib/sales/actions";
import { formatMoney, healthTone } from "@/lib/sales/format";
import { STAGES, stageLabel } from "@/lib/sales/stages";

interface Props {
  dealId: string;
  companyName: string;
  dealValue: number | null;
  currency: string;
  stage: string;
  health: number | null;
  status: string;
  createdAt: string;
}

export function DealHeader({ dealId, companyName, dealValue, currency, stage, health, status, createdAt }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(dealValue?.toString() ?? "");
  const [newStage, setNewStage] = useState(stage);
  const [newStatus, setNewStatus] = useState(status);
  const [pending, startTransition] = useTransition();
  const tone = healthTone(health);

  const save = () => {
    startTransition(async () => {
      await updateDeal(dealId, {
        deal_value: value ? Number(value) : null,
        stage: newStage,
        status: newStatus,
      });
      setEditing(false);
      router.refresh();
    });
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-900">{companyName}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <span className="text-2xl font-semibold tracking-tight text-slate-900">
              {formatMoney(dealValue, currency)}
            </span>
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              {stageLabel(stage)}
            </span>
            <span
              className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                status === "won"
                  ? "bg-emerald-50 text-emerald-700"
                  : status === "lost"
                    ? "bg-red-50 text-red-700"
                    : "bg-slate-100 text-slate-600"
              }`}
            >
              {status.toUpperCase()}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-6">
          {health != null && (
            <div className="text-right">
              <div className={`text-4xl font-semibold tracking-tight ${tone.text}`}>{health}</div>
              <div className="text-[11px] text-slate-400">Deal health</div>
            </div>
          )}
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-300 hover:text-slate-900"
          >
            {editing ? "Done" : "Edit"}
          </button>
        </div>
      </div>

      {editing && (
        <div className="mb-6 flex flex-wrap items-end gap-4 rounded-2xl border border-slate-200 bg-white p-4">
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-slate-500">Deal value</span>
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              type="number"
              min={0}
              className="w-36 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-slate-500">Stage</span>
            <select
              value={newStage}
              onChange={(e) => setNewStage(e.target.value)}
              className="w-52 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
            >
              {STAGES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-slate-500">Status</span>
            <select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
              className="w-28 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
            >
              <option value="open">Open</option>
              <option value="won">Won</option>
              <option value="lost">Lost</option>
            </select>
          </label>
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-40"
          >
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      )}

      <p className="text-[11px] text-slate-400">
        Created {new Date(createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
      </p>
    </div>
  );
}