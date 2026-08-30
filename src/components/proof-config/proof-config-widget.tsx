"use client";

import { SettingsIcon, Spinner } from "@/components/wallnut/icons";
import {
  DEFAULT_PROOF_ADMIN_SETTINGS,
  PROOF_CHECK_LABELS,
  PROOF_RESPONSE_STYLES,
  PROOF_RESPONSE_STYLE_LABELS,
  type ProofAdminSettings,
  type ProofCheckType,
} from "@/lib/proof/proof-settings";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useProofConfig } from "./use-proof-config";

const QUICK_CHECKS: ProofCheckType[] = ["typos", "grammar", "punctuation"];

const REPLY_LABELS = ["Plain", "Mixed", "Human"] as const;

const PILL_BUTTON =
  "inline-flex items-center gap-1.5 rounded-full border border-[#2e2e2e] bg-[#0a0a0a] px-3.5 py-1.5 text-[12px] text-[#919191] transition hover:border-[#3a3a3a] hover:text-white disabled:cursor-progress disabled:opacity-70";

const LIST_ROW =
  "flex w-full cursor-pointer items-start gap-2.5 rounded-[6px] px-1 py-1.5 text-left transition hover:bg-[#0a0a0a] disabled:cursor-not-allowed disabled:opacity-50";

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

  return (
    <div ref={rootRef} className="flex flex-col-reverse items-center gap-2">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="dialog"
        disabled={busy && !open}
        className={`${PILL_BUTTON} ${open ? "border-[#3a3a3a] text-white" : ""}`}
      >
        {busy ? <Spinner /> : <SettingsIcon size={14} />}
        Bot settings
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Bot settings"
          className="wallnut-reveal w-[min(calc(100vw-2rem),480px)] rounded-[8px] border border-[#111111] bg-[#060606] shadow-[0_16px_40px_rgba(0,0,0,0.45)]"
        >
          <div className="grid grid-cols-2 divide-x divide-[#131313]">
            <section className="px-3 py-3">
              <SectionTitle>Wallnut&apos;s reply</SectionTitle>
              <div
                role="radiogroup"
                aria-label="Wallnut's reply"
                className="flex flex-col gap-0.5"
              >
                {PROOF_RESPONSE_STYLES.map((style, index) => {
                  const meta = PROOF_RESPONSE_STYLE_LABELS[style];
                  return (
                    <ReplyOption
                      key={style}
                      label={REPLY_LABELS[index] ?? meta.title}
                      description={meta.description}
                      checked={settings.responseStyle === style}
                      disabled={busy}
                      onSelect={() => selectStyle(style)}
                    />
                  );
                })}
              </div>
            </section>

            <section className="px-3 py-3">
              <SectionTitle>Checks</SectionTitle>
              <div className="flex flex-col gap-0.5">
                {QUICK_CHECKS.map((key) => (
                  <CheckOption
                    key={key}
                    label={PROOF_CHECK_LABELS[key].title}
                    description={PROOF_CHECK_LABELS[key].description}
                    checked={settings.checks[key]}
                    disabled={busy}
                    onChange={() => toggleCheck(key)}
                  />
                ))}
              </div>
            </section>
          </div>

          {error && error !== "Forbidden" ? (
            <p
              role="alert"
              className="border-t border-[#131313] px-3 py-2 text-center text-[10px] text-[#e8b4b4]"
            >
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
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
          checked ? "border-[#bdbdbd]" : "border-[#444] bg-[#060606]"
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

function CheckOption({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
}) {
  return (
    <label className={LIST_ROW}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="sr-only"
      />
      <span
        aria-hidden
        className={`mt-0.5 flex size-3.5 shrink-0 items-center justify-center rounded-[4px] border transition ${
          checked
            ? "border-[#bdbdbd] bg-[#d4d4d4] text-[#060606]"
            : "border-[#444] bg-[#060606]"
        }`}
      >
        {checked ? (
          <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
            <path
              d="M2.5 6 5 8.5 9.5 3.5"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : null}
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
