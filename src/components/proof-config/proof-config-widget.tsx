"use client";

import {
  DEFAULT_PROOF_ADMIN_SETTINGS,
  PROOF_RESPONSE_STYLES,
  PROOF_RESPONSE_STYLE_LABELS,
  checksToDepth,
  depthToChecks,
  type ProofAdminSettings,
} from "@/lib/proof/proof-settings";
import { useProofConfig } from "./use-proof-config";

const CHECK_STOPS = [
  {
    label: "Typos",
    tooltip: "Spelling mistakes only.",
  },
  {
    label: "Standard",
    tooltip: "Typos, grammar, punctuation, and capitalization.",
  },
  {
    label: "All",
    tooltip: "Every proof check enabled.",
  },
] as const;

const REPLY_STOPS = PROOF_RESPONSE_STYLES.map((style, index) => {
  const meta = PROOF_RESPONSE_STYLE_LABELS[style];
  const labels = ["Plain", "Mixed", "Human"] as const;
  return {
    label: labels[index] ?? meta.title,
    tooltip: meta.description,
  };
});

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
    <div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <SegmentSlider
          label="Checks"
          value={depth}
          max={CHECK_STOPS.length - 1}
          stops={CHECK_STOPS}
          disabled={busy}
          onChange={(value) => setCheckDepth(value)}
        />
        <SegmentSlider
          label="Reply"
          value={styleIndex}
          max={REPLY_STOPS.length - 1}
          stops={REPLY_STOPS}
          disabled={busy}
          onChange={(value) => selectStyle(PROOF_RESPONSE_STYLES[value]!)}
        />
      </div>
      {error && error !== "Forbidden" ? (
        <p role="alert" className="mt-2 text-center text-[10px] text-[#e8b4b4]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

type Stop = { label: string; tooltip: string };

function SegmentSlider({
  label,
  value,
  max,
  stops,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  stops: readonly Stop[];
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-full border border-[#2e2e2e] bg-[#161616] px-4 py-2.5">
      <span className="shrink-0 text-[12px] font-bold text-[#fbfbfb]">{label}</span>
      <div className="min-w-0 flex-1">
        <input
          type="range"
          min={0}
          max={max}
          step={1}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(Number(event.target.value))}
          className="proof-segment-slider block w-full disabled:cursor-not-allowed disabled:opacity-50"
          aria-valuetext={stops[value]?.label ?? String(value)}
        />
        <div
          className="mt-1.5 grid"
          style={{ gridTemplateColumns: `repeat(${stops.length}, minmax(0, 1fr))` }}
        >
          {stops.map((stop, index) => (
            <StopTick
              key={stop.label}
              stop={stop}
              active={index === value}
              disabled={disabled}
              onSelect={() => onChange(index)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function StopTick({
  stop,
  active,
  disabled,
  onSelect,
}: {
  stop: Stop;
  active: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      aria-label={stop.label}
      className="group/stop relative flex justify-center disabled:cursor-not-allowed"
    >
      <span
        className={`h-1.5 w-px transition ${
          active ? "bg-[#bdbdbd]" : "bg-[#444] group-hover/stop:bg-[#666]"
        }`}
      />
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 z-20 w-max max-w-[11rem] -translate-x-1/2 rounded-[6px] border border-[#2a2a2a] bg-[#161616] px-2 py-1 text-center text-[10px] leading-snug text-[#fbfbfb] opacity-0 shadow-[0_8px_20px_rgba(0,0,0,0.45)] transition group-hover/stop:opacity-100 group-focus-visible/stop:opacity-100"
      >
        <span className="block font-medium">{stop.label}</span>
        <span className="mt-0.5 block text-[#919191]">{stop.tooltip}</span>
      </span>
    </button>
  );
}
