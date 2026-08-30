"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { InitialAvatar } from "@/components/wallnut/avatar";
import { TeamManager } from "@/components/team-manager";

interface MemberPreview {
  email: string | null;
}
interface InvitePreview {
  invited_email: string;
}

export function TeamAccess({ orgSlug }: { orgSlug: string }) {
  const [open, setOpen] = useState(false);
  const [members, setMembers] = useState<MemberPreview[]>([]);
  const [invites, setInvites] = useState<InvitePreview[]>([]);
  const [loading, setLoading] = useState(true);

  const loadPreview = useCallback(async () => {
    try {
      const res = await fetch(`/api/org/members?org=${encodeURIComponent(orgSlug)}`);
      if (!res.ok) return;
      const data = await res.json();
      setMembers((data.members ?? []).map((member: { email?: string | null }) => ({
        email: member.email ?? null,
      })));
      setInvites(data.invites ?? []);
    } finally {
      setLoading(false);
    }
  }, [orgSlug]);

  useEffect(() => {
    void loadPreview();
  }, [loadPreview]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const stack = useMemo(() => {
    const labels = [
      ...members.map((member) => member.email).filter(Boolean),
      ...invites.map((invite) => invite.invited_email),
    ] as string[];
    const unique = [...new Set(labels.map((label) => label.toLowerCase()))].map(
      (key) => labels.find((label) => label.toLowerCase() === key)!,
    );
    const shown = unique.slice(0, 3);
    const overflow = Math.max(unique.length - shown.length, 0);
    return { shown, overflow, total: unique.length };
  }, [members, invites]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open team members and invites"
        className="group rounded-full border border-transparent p-1 transition hover:border-[#2e2e2e] hover:bg-[#0a0a0a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <AvatarStack
          labels={stack.shown}
          overflow={stack.overflow}
          loading={loading}
        />
      </button>

      {open
        ? createPortal(
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4">
              <button
                type="button"
                aria-label="Close team dialog"
                className="absolute inset-0"
                onClick={() => setOpen(false)}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="team-access-title"
                className="relative z-10 flex max-h-[min(90vh,760px)] w-full max-w-[680px] flex-col overflow-hidden rounded-[10px] border border-[#111111] bg-[#0a0a0a] shadow-[0_24px_48px_rgba(0,0,0,0.55)]"
              >
                <div className="flex shrink-0 items-center justify-between border-b border-[#131313] px-4 py-3">
                  <h2 id="team-access-title" className="text-[14px] font-bold text-[#fbfbfb]">
                    Dashboard access
                  </h2>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-[6px] px-2 py-1 text-[12px] text-[#919191] transition hover:bg-[#0a0a0a] hover:text-white"
                  >
                    Close
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                  <TeamManager
                    orgSlug={orgSlug}
                    onUpdated={() => {
                      void loadPreview();
                    }}
                  />
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function AvatarStack({
  labels,
  overflow,
  loading,
}: {
  labels: string[];
  overflow: number;
  loading: boolean;
}) {
  if (loading) {
    return (
      <span className="inline-flex size-[26px] animate-pulse items-center justify-center rounded-full bg-[#090909] ring-[1.5px] ring-black" />
    );
  }

  if (labels.length === 0) {
    return (
      <span className="inline-flex size-[26px] items-center justify-center rounded-full border border-dashed border-[#333] bg-[#060606] text-[12px] text-[#6c6c6c] ring-[1.5px] ring-black">
        +
      </span>
    );
  }

  return (
    <span className="inline-flex items-center transition group-hover:opacity-95">
      <span className="flex -space-x-2">
        {labels.map((label, index) => (
          <InitialAvatar
            key={`${label}-${index}`}
            label={label}
            size={26}
            className="ring-2 ring-black transition group-hover:ring-[#2a2a2a]"
            style={{ zIndex: labels.length - index }}
          />
        ))}
      </span>
      {overflow > 0 ? (
        <span className="ml-1.5 inline-flex size-[26px] items-center justify-center rounded-full bg-[#090909] text-[9px] font-bold text-[#919191] ring-[1.5px] ring-black transition group-hover:bg-[#222] group-hover:text-[#bdbdbd] group-hover:ring-[#2a2a2a]">
          +{overflow}
        </span>
      ) : null}
    </span>
  );
}
