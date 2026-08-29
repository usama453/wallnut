"use client";

import {
  DEFAULT_PROOF_ADMIN_SETTINGS,
  PROOF_RESPONSE_STYLES,
  checksToDepth,
  depthToChecks,
  type ProofAdminSettings,
} from "@/lib/proof/proof-settings";
import { useProofConfig } from "./use-proof-config";

const DEPTH_LABELS = ["Typos", "Standard", "All"] as const;
const STYLE_LABELS = ["Plain", "Mixed", "Human"] as const;

export function ProofConfigWidget({
  initialSettings = DEFAULT_PROOF_ADMIN_SETTINGS,
}: {
  initialSettings?: ProofAdminSettings;
}) {
  const { settings, busy, error, loaded, selectStyle, setCheckDepth } =
    useProofConfig(initialSettings);

  if (loaded && error === "Forbidden") return null;

  const depth = checksToDepth(settings.checks);
  const styleIndex = Math.max(
    0,
    PROOF_RESPONSE_STYLES.indexOf(settings.responseStyle),
  );

  return (
    <div className="rounded-[8px] border border-[#1b1b1b] bg-[#101010] px-3 py-2.5">
      <div className="space-y-2.5">
        <MiniSlider
          label="Checks"
          value={depth}
          max={2}
          valueLabel={DEPTH_LABELS[depth]}
          disabled={busy}
          onChange={(value) => setCheckDepth(value)}
        />
        <MiniSlider
          label="Reply"
          value={styleIndex}
          max={2}
          valueLabel={STYLE_LABELS[styleIndex]}
          disabled={busy}
          onChange={(value) => selectStyle(PROOF_RESPONSE_STYLES[value]!)}
        />
      </div>
      {error && error !== "Forbidden" ? (
        <p role="alert" className="mt-2 text-[10px] text-[#e8b4b4]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function MiniSlider({
  label,
  value,
  max,
  valueLabel,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  valueLabel: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className="grid grid-cols-[3.25rem_1fr_auto] items-center gap-2">
      <span className="text-[10px] text-[#6c6c6c]">{label}</span>
      <input
        type="range"
        min={0}
        max={max}
        step={1}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-1 w-full cursor-pointer appearance-none rounded-full bg-[#252525] accent-[#bdbdbd] disabled:cursor-not-allowed disabled:opacity-50 [&::-moz-range-thumb]:size-2.5 [&::-webkit-slider-thumb]:size-2.5"
      />
      <span className="w-14 truncate text-right text-[10px] text-[#919191]">
        {valueLabel}
      </span>
    </div>
  );
}
