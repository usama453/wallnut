"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createPortal } from "react-dom";
import { Spinner } from "@/components/wallnut/icons";
import { orgHomePath } from "@/lib/org-paths";

export function RemoveWhatsAppGroup({
  orgSlug,
  groupId,
  code,
  groupName,
  className = "",
  redirectHome = false,
  onRemoved,
}: {
  orgSlug: string;
  groupId?: string;
  code?: string;
  groupName: string;
  className?: string;
  redirectHome?: boolean;
  onRemoved?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmRemove() {
    if (removing) return;
    setRemoving(true);
    setError(null);
    try {
      const response = await fetch("/api/whatsapp/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove", org: orgSlug, groupId, code }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Failed to remove group");
      setOpen(false);
      onRemoved?.();
      if (redirectHome) {
        router.push(orgHomePath(orgSlug));
        router.refresh();
      } else {
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove group");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={removing}
        aria-label="Remove group"
        aria-busy={removing}
        className={`rounded-[6px] p-1.5 text-[#555] transition hover:bg-[#0a0a0a] hover:text-[#d18f8f] disabled:cursor-progress disabled:opacity-60 ${className}`}
      >
        {removing ? <Spinner /> : <TrashIcon />}
      </button>

      {open
        ? createPortal(
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4">
              <button
                type="button"
                aria-label="Close remove group dialog"
                className="absolute inset-0"
                onClick={() => !removing && setOpen(false)}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="remove-group-title"
                className="relative z-10 w-full max-w-[360px] rounded-[10px] border border-[#111111] bg-[#060606] p-5 shadow-[0_24px_48px_rgba(0,0,0,0.55)]"
              >
                <h2 id="remove-group-title" className="text-[14px] font-bold text-[#fbfbfb]">
                  Remove WhatsApp group?
                </h2>
                <p className="mt-2 text-[12px] leading-relaxed text-[#919191]">
                  Wallnut will stop responding in{" "}
                  <span className="text-[#bdbdbd]">{groupName}</span>. You can link it again
                  later with a new code.
                </p>
                {error ? (
                  <p role="alert" className="mt-3 text-[11px] text-[#e8b4b4]">
                    {error}
                  </p>
                ) : null}
                <div className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    disabled={removing}
                    className="rounded-full border border-[#111111] px-3.5 py-1.5 text-[12px] text-[#919191] transition hover:border-[#1a1a1a] hover:text-white disabled:opacity-60"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void confirmRemove()}
                    disabled={removing}
                    aria-busy={removing}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[#4a2828] bg-[#1a1010] px-3.5 py-1.5 text-[12px] text-[#e8b4b4] transition hover:border-[#6a3838] disabled:cursor-progress disabled:opacity-70"
                  >
                    {removing ? <Spinner /> : null}
                    {removing ? "Removing…" : "Remove group"}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function TrashIcon() {
  return (
    <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path
        d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7h12Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M10 11v5M14 11v5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
