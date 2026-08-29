"use client";

import { useCallback, useEffect, useState } from "react";
import { PlatformIcon } from "@/components/wallnut/icons";

interface AuthCode {
  id: string;
  code: string;
  status: string;
  isExpired: boolean;
  expiresAt: string | null;
  groupJid: string | null;
  groupName: string | null;
  createdAt: string | null;
  usedAt: string | null;
}

interface LinkedGroup {
  id: string;
  name: string;
  external_id: string;
  created_at: string;
}

export function WhatsAppGroups({ codes: serverCodes }: { codes: AuthCode[] }) {
  const [linkedGroups, setLinkedGroups] = useState<LinkedGroup[]>([]);
  const [generating, setGenerating] = useState(false);
  const [newCode, setNewCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<{ role: string } | null>(null);
  const isAdmin = profile?.role === "owner" || profile?.role === "admin";

  const loadData = useCallback(async () => {
    try {
      const [profileResponse, groupsResponse] = await Promise.all([
        fetch("/api/me", { cache: "no-store" }),
        fetch("/api/whatsapp/groups", { cache: "no-store" }),
      ]);
      if (profileResponse.ok) setProfile(await profileResponse.json());
      if (groupsResponse.ok) {
        const data = await groupsResponse.json();
        setLinkedGroups(data.groups ?? []);
      }
    } catch {
      setError("Failed to load linked groups.");
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function handleCreateCode() {
    if (!isAdmin) return;
    setGenerating(true);
    setError(null);
    try {
      const response = await fetch("/api/whatsapp/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Failed to create code");
      setNewCode(data.code);
      await loadData();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Network error");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <details className="overflow-hidden rounded-[8px] border border-[#1b1b1b] bg-[#0b0b0b]">
      <summary className="flex list-none items-center justify-between gap-4 px-4 py-3 transition hover:bg-[#121212] [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-center gap-2">
          <PlatformIcon platform="whatsapp" />
          <span className="truncate text-[12px] font-bold text-[#d0d0d0]">
            WhatsApp group connections
          </span>
        </span>
        <span className="shrink-0 text-[11px] text-[#6c6c6c]">
          {linkedGroups.length} linked · Configure
        </span>
      </summary>

      <div className="border-t border-[#1b1b1b] p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <p className="max-w-lg text-[11px] leading-relaxed text-[#6c6c6c]">
            Link a WhatsApp group by creating a one-time code and pasting it into
            the group conversation.
          </p>
          {isAdmin ? (
            <button
              type="button"
              onClick={handleCreateCode}
              disabled={generating}
              className="rounded-[7px] bg-[#fbfbfb] px-3 py-2 text-[11px] font-bold text-black transition hover:bg-[#e8e8e8] disabled:opacity-50"
            >
              {generating ? "Creating…" : "Create auth code"}
            </button>
          ) : null}
        </div>

        {newCode ? (
          <div className="mt-4 flex items-center justify-between gap-4 rounded-[8px] border border-emerald-950 bg-emerald-950/20 p-3">
            <div>
              <p className="text-[10px] text-emerald-400/70">Paste this code in WhatsApp</p>
              <p className="mt-1 font-mono text-xl tracking-[0.18em] text-emerald-200">
                {newCode}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setNewCode(null)}
              className="text-[11px] text-emerald-400/70 hover:text-emerald-300"
            >
              Dismiss
            </button>
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="mt-4 text-[11px] text-[#e8b4b4]">
            {error}
          </p>
        ) : null}

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <ConnectionList title="Linked groups" empty="No WhatsApp groups linked yet.">
            {linkedGroups.map((group) => (
              <div
                key={group.id}
                className="rounded-[7px] border border-[#202020] bg-[#101010] px-3 py-2.5"
              >
                <p className="truncate text-[12px] font-medium text-[#d0d0d0]">
                  {group.name}
                </p>
                <p className="mt-1 truncate font-mono text-[9px] text-[#555]">
                  {group.external_id}
                </p>
              </div>
            ))}
          </ConnectionList>

          <ConnectionList title="Auth codes" empty="No auth codes generated yet.">
            {serverCodes.map((code) => {
              const expired = code.status === "expired" || code.isExpired;
              const tone =
                code.status === "used"
                  ? "text-emerald-400"
                  : expired
                    ? "text-red-400"
                    : "text-amber-300";
              return (
                <div
                  key={code.id}
                  className="flex items-center justify-between gap-3 rounded-[7px] border border-[#202020] bg-[#101010] px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className={`font-mono text-[13px] tracking-wider ${tone}`}>{code.code}</p>
                    {code.groupName ? (
                      <p className="mt-1 truncate text-[9px] text-[#555]">{code.groupName}</p>
                    ) : null}
                  </div>
                  <span className={`text-[9px] uppercase tracking-wider ${tone}`}>
                    {code.status === "used" ? "Used" : expired ? "Expired" : "Pending"}
                  </span>
                </div>
              );
            })}
          </ConnectionList>
        </div>

        {!isAdmin ? (
          <p className="mt-4 text-[10px] text-[#555]">
            Only workspace owners and admins can create codes.
          </p>
        ) : null}
      </div>
    </details>
  );
}

function ConnectionList({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: React.ReactNode;
}) {
  const items = Array.isArray(children) ? children : [children];
  return (
    <section>
      <h3 className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#6c6c6c]">
        {title}
      </h3>
      {items.length > 0 ? (
        <div className="space-y-2">{children}</div>
      ) : (
        <p className="py-3 text-[11px] text-[#555]">{empty}</p>
      )}
    </section>
  );
}
