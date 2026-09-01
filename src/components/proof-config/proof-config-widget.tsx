"use client";

import { SettingsIcon, Spinner } from "@/components/wallnut/icons";
import { WALLNUT_PILL_BUTTON } from "@/components/wallnut/panel";
import {
  DEFAULT_PROOF_ADMIN_SETTINGS,
  PROOF_RESPONSE_STYLES,
  PROOF_RESPONSE_STYLE_LABELS,
  type ProofAdminSettings,
} from "@/lib/proof/proof-settings";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useProofConfig } from "./use-proof-config";

const LIST_ROW =
  "flex w-full cursor-pointer items-start gap-2.5 rounded-[6px] px-1 py-1.5 text-left transition hover:bg-[#0a0a0a] disabled:cursor-not-allowed disabled:opacity-50";

export function ProofConfigWidget({
  orgSlug,
  initialSettings = DEFAULT_PROOF_ADMIN_SETTINGS,
}: {
  orgSlug: string;
  initialSettings?: ProofAdminSettings;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const { settings, busy, error, loaded, selectStyle } = useProofConfig(
    orgSlug,
    initialSettings,
  );

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

  return (
    <div ref={rootRef} className="relative">
      {open ? (
        <div
          role="dialog"
          aria-label="Wallnut's settings"
          className="wallnut-reveal absolute bottom-[calc(100%+8px)] left-1/2 z-50 w-[min(calc(100vw-2rem),320px)] -translate-x-1/2 rounded-[8px] border border-[#222222] bg-[#060606] shadow-[0_16px_40px_rgba(0,0,0,0.45)]"
        >
          <section className="px-3 py-3">
            <SectionTitle>Wallnut&apos;s reply</SectionTitle>
            <div
              role="radiogroup"
              aria-label="Wallnut's reply"
              className="flex flex-col gap-0.5"
            >
              {PROOF_RESPONSE_STYLES.map((style) => {
                const meta = PROOF_RESPONSE_STYLE_LABELS[style];
                return (
                  <ReplyOption
                    key={style}
                    label={meta.title}
                    description={meta.description}
                    checked={settings.responseStyle === style}
                    disabled={busy}
                    onSelect={() => selectStyle(style)}
                  />
                );
              })}
            </div>
          </section>

          {error && error !== "Forbidden" ? (
            <p
              role="alert"
              className="border-t border-[#222222] px-3 py-2 text-center text-[10px] text-[#e8b4b4]"
            >
              {error}
            </p>
          ) : null}
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="dialog"
        disabled={busy && !open}
        className={`${WALLNUT_PILL_BUTTON} ${open ? "border-[#2e2e2e] text-white" : ""}`}
      >
        {busy ? <Spinner /> : <SettingsIcon size={14} />}
        Wallnut&apos;s settings
      </button>
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="mb-2 text-[10px] font-medium uppercase tracking-[0.04em] text-[#6c6c6c]">
      {children}
    </h3>
  );
}

function ReplyOption({
  label,
  description,
  checked,
  disabled,
  onSelect,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <label className={LIST_ROW}>
      <input
        type="radio"
        name="wallnut-reply-style"
        checked={checked}
        disabled={disabled}
        onChange={onSelect}
        className="sr-only"
      />
      <span
        aria-hidden
        className={`mt-0.5 flex size-3.5 shrink-0 items-center justify-center rounded-full border transition ${
          checked ? "border-[#bdbdbd]" : "border-[#222222] bg-[#060606]"
        }`}
      >
        {checked ? <span className="size-1.5 rounded-full bg-[#d4d4d4]" /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={`block text-[12px] leading-none ${
            checked ? "text-[#fbfbfb]" : "text-[#bdbdbd]"
          }`}
        >
          {label}
        </span>
        <span className="mt-1 block text-[10px] leading-snug text-[#6c6c6c]">
          {description}
        </span>
      </span>
    </label>
  );
}
