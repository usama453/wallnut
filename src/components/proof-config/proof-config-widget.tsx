"use client";

import { Spinner } from "@/components/wallnut/icons";
import {
  DEFAULT_PROOF_ADMIN_SETTINGS,
  PROOF_CHECK_LABELS,
  PROOF_RESPONSE_STYLES,
  PROOF_RESPONSE_STYLE_LABELS,
  type ProofAdminSettings,
  type ProofCheckType,
} from "@/lib/proof/proof-settings";
import { useEffect, useRef, useState } from "react";
import { useProofConfig } from "./use-proof-config";

const THUMB_SIZE = 14;
const THUMB_RADIUS = THUMB_SIZE / 2;
const LABEL_WIDTH = "3.75rem";

const QUICK_CHECKS: ProofCheckType[] = ["typos", "grammar", "punctuation"];

const REPLY_STOPS = PROOF_RESPONSE_STYLES.map((style, index) => {
  const meta = PROOF_RESPONSE_STYLE_LABELS[style];
  const labels = ["Plain", "Mixed", "Human"] as const;
  return {
    label: labels[index] ?? meta.title,
    tooltip: meta.description,
  };
});

const PILL_BUTTON =
  "inline-flex items-center gap-1.5 rounded-full border border-[#2e2e2e] bg-[#161616] px-3.5 py-1.5 text-[12px] text-[#919191] transition hover:border-[#3a3a3a] hover:text-white disabled:cursor-progress disabled:opacity-70";

export function ProofConfigWidget({
  initialSettings = DEFAULT_PROOF_ADMIN_SETTINGS,
}: {
  initialSettings?: ProofAdminSettings;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const { settings, busy, error, loaded, toggleCheck, selectStyle } =
    useProofConfig(initialSettings);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (loaded && error === "Forbidden") return null;

  const styleIndex = Math.max(
    0,
    PROOF_RESPONSE_STYLES.indexOf(settings.responseStyle),
  );

  return (
    <div ref={rootRef} className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="dialog"
        disabled={busy && !open}
        className={`${PILL_BUTTON} ${open ? "border-[#3a3a3a] text-white" : ""}`}
      >
        {busy ? <Spinner /> : null}
        Bot settings
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Bot settings"
          className="wallnut-reveal w-full max-w-[300px] rounded-[8px] border border-[#1b1b1b] bg-[#101010] px-3 py-3 shadow-[0_16px_40px_rgba(0,0,0,0.45)]"
        >
          <SegmentSlider
            label="Reply"
            value={styleIndex}
            max={REPLY_STOPS.length - 1}
            stops={REPLY_STOPS}
            disabled={busy}
            onChange={(value) => selectStyle(PROOF_RESPONSE_STYLES[value]!)}
          />

          <div className="mt-3 border-t border-[#1f1f1f] pt-3">
            <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.04em] text-[#6c6c6c]">
              Checks
            </p>
            <div className="space-y-1">
              {QUICK_CHECKS.map((key) => (
                <label
                  key={key}
                  className="flex cursor-pointer items-center gap-2.5 rounded-[6px] px-1 py-1 text-[12px] text-[#bdbdbd] transition hover:text-white"
                >
                  <input
                    type="checkbox"
                    className="size-3.5 rounded border-[#3a3a3a] bg-[#161616] accent-[#d4d4d4]"
                    checked={settings.checks[key]}
                    disabled={busy}
                    onChange={() => toggleCheck(key)}
                  />
                  <span>{PROOF_CHECK_LABELS[key].title}</span>
                </label>
              ))}
            </div>
          </div>

          {error && error !== "Forbidden" ? (
            <p role="alert" className="mt-2 text-center text-[10px] text-[#e8b4b4]">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

type Stop = { label: string; tooltip: string };

function stopOffset(index: number, max: number) {
  if (max <= 0) return `${THUMB_RADIUS}px`;
  const ratio = index / max;
  return `calc(${THUMB_RADIUS}px + (100% - ${THUMB_SIZE}px) * ${ratio})`;
}

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
    <div className="rounded-full border border-[#2e2e2e] bg-[#161616] px-3 py-2">
      <div className="flex items-start gap-2.5">
        <span
          className="mt-[1px] shrink-0 text-[12px] font-bold leading-none text-[#fbfbfb]"
          style={{ width: LABEL_WIDTH }}
        >
          {label}
        </span>

        <div className="min-w-0 flex-1">
          <div className="relative h-[14px]">
            <div
              className="pointer-events-none absolute top-1/2 h-px -translate-y-1/2 bg-[#2a2a2a]"
              style={{ left: THUMB_RADIUS, right: THUMB_RADIUS }}
            />
            <input
              type="range"
              min={0}
              max={max}
              step={1}
              value={value}
              disabled={disabled}
              onChange={(event) => onChange(Number(event.target.value))}
              className="proof-segment-slider absolute inset-0 z-10 m-0 w-full disabled:cursor-not-allowed disabled:opacity-50"
              aria-valuetext={stops[value]?.label ?? String(value)}
            />
          </div>

          <div className="relative mt-1 h-3">
            {stops.map((stop, index) => (
              <StopTick
                key={stop.label}
                stop={stop}
                active={index === value}
                disabled={disabled}
                left={stopOffset(index, max)}
                onSelect={() => onChange(index)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StopTick({
  stop,
  active,
  disabled,
  left,
  onSelect,
}: {
  stop: Stop;
  active: boolean;
  disabled?: boolean;
  left: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      aria-label={stop.label}
      className="group/stop absolute top-0 -translate-x-1/2 disabled:cursor-not-allowed"
      style={{ left }}
    >
      <span
        className={`block h-1.5 w-px transition ${
          active ? "bg-[#bdbdbd]" : "bg-[#444] group-hover/stop:bg-[#666]"
        }`}
      />
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 z-20 w-max max-w-[11rem] -translate-x-1/2 rounded-[6px] border border-[#2a2a2a] bg-[#161616] px-2 py-1 text-center text-[10px] leading-snug text-[#fbfbfb] opacity-0 shadow-[0_8px_20px_rgba(0,0,0,0.45)] transition group-hover/stop:opacity-100 group-focus-visible/stop:opacity-100"
      >
        <span className="block font-medium">{stop.label}</span>
        <span className="mt-0.5 block text-[#919191]">{stop.tooltip}</span>
      </span>
    </button>
  );
}
