"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  const stack = useMemo(() => {
    const labels = [
      ...members.map((member) => member.email).filter(Boolean),
      ...invites.map((invite) => invite.invited_email),
    ] as string[];
    const shown = labels.slice(0, 3);
    const overflow = Math.max(labels.length - shown.length, 0);
    return { shown, overflow, total: labels.length };
  }, [members, invites]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open team members and invites"
        className="rounded-full p-0.5 transition hover:bg-[#161616] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <AvatarStack
          labels={stack.shown}
          overflow={stack.overflow}
          loading={loading}
        />
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/75 px-4 py-8 sm:items-center">
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
            className="relative z-10 w-full max-w-[680px]"
          >
            <div className="mb-3 flex items-center justify-between px-1">
              <h2 id="team-access-title" className="text-[14px] font-bold text-[#fbfbfb]">
                Team
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-[6px] px-2 py-1 text-[12px] text-[#919191] transition hover:bg-[#161616] hover:text-white"
              >
                Close
              </button>
            </div>
            <div className="max-h-[min(80vh,720px)] overflow-y-auto rounded-[10px]">
              <TeamManager
                orgSlug={orgSlug}
                onUpdated={() => {
                  void loadPreview();
                }}
              />
            </div>
          </div>
        </div>
      ) : null}
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
      <span className="inline-flex size-[26px] animate-pulse items-center justify-center rounded-full bg-[#1a1a1a] ring-[1.5px] ring-black" />
    );
  }

  if (labels.length === 0) {
    return (
      <span className="inline-flex size-[26px] items-center justify-center rounded-full border border-dashed border-[#333] bg-[#101010] text-[12px] text-[#6c6c6c] ring-[1.5px] ring-black">
        +
      </span>
    );
  }

  return (
    <span className="inline-flex items-center">
      <span className="flex -space-x-2">
        {labels.map((label, index) => (
          <InitialAvatar
            key={`${label}-${index}`}
            label={label}
            size={26}
            className="ring-2 ring-black"
            style={{ zIndex: labels.length - index }}
          />
        ))}
      </span>
      {overflow > 0 ? (
        <span className="ml-1.5 inline-flex size-[26px] items-center justify-center rounded-full bg-[#1a1a1a] text-[9px] font-bold text-[#919191] ring-[1.5px] ring-black">
          +{overflow}
        </span>
      ) : null}
    </span>
  );
}
