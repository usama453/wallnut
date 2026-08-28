"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface AuthCode {
  id: string;
  code: string;
  status: string;
  isExpired: boolean;
  expiresAt: string;
  groupJid: string | null;
  groupName: string | null;
  createdAt: string;
  usedAt: string | null;
}

interface LinkedGroup {
  id: string;
  name: string;
  external_id: string;
  created_at: string;
}

export function WhatsAppGroups() {
  const [codes, setCodes] = useState<AuthCode[]>([]);
  const [linkedGroups, setLinkedGroups] = useState<LinkedGroup[]>([]);
  const [generating, setGenerating] = useState(false);
  const [newCode, setNewCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<{ role: string } | null>(null);

  const isAdmin = profile?.role === "owner" || profile?.role === "admin";

  const loadData = async () => {
    try {
      const [dataRes, profileRes] = await Promise.all([
        fetch("/api/whatsapp/groups"),
        fetch("/api/me"),
      ]);
      if (profileRes.ok) setProfile(await profileRes.json());
      if (dataRes.ok) {
        const d = await dataRes.json();
        setCodes(d.codes ?? []);
        setLinkedGroups(d.groups ?? []);
      }
    } catch {
      setError("Failed to load data");
    }
  };

  useState(() => { loadData(); });

  const handleCreateCode = async () => {
    if (!isAdmin) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/whatsapp/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create code");
        return;
      }
      setNewCode(data.code);
      loadData();
    } catch {
      setError("Network error");
    } finally {
      setGenerating(false);
    }
  };

  const formatDate = (s: string) =>
    new Date(s).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-200">
            WhatsApp Groups
          </h2>
          <p className="text-xs text-slate-500">
            Link WhatsApp groups to this workspace using one-time auth codes.
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={handleCreateCode}
            disabled={generating}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm text-white transition hover:bg-indigo-500 disabled:opacity-50"
          >
            {generating ? "Creating…" : "Create auth code"}
          </button>
        )}
      </div>

      {newCode && (
        <div className="rounded-lg border border-emerald-700 bg-emerald-900/30 p-4">
          <p className="text-sm text-emerald-300">
            Your code:{" "}
            <span className="font-mono text-xl tracking-wider text-emerald-200">
              {newCode}
            </span>
          </p>
          <p className="mt-1 text-xs text-emerald-400/70">
            Paste this inside the WhatsApp group you want to link. The bot will
            detect it and connect the group to your workspace.
          </p>
          <button
            onClick={() => setNewCode(null)}
            className="mt-3 float-right text-xs text-emerald-400 hover:text-emerald-300"
          >
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-700 bg-red-900/30 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Linked groups */}
      <div>
        <h3 className="mb-2 text-sm font-medium text-slate-300">
          Linked groups (
          {linkedGroups.length})
        </h3>
        {linkedGroups.length === 0 ? (
          <p className="text-xs text-slate-500">
            No groups linked yet. Create an auth code above and paste it in your
            WhatsApp group.
          </p>
        ) : (
          <div className="space-y-2">
            {linkedGroups.map((g) => (
              <div
                key={g.id}
                className="rounded-lg border border-slate-700 bg-slate-800/50 p-3"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-200">{g.name}</p>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">
                      {g.external_id}
                    </p>
                  </div>
                  <span className="text-[10px] uppercase tracking-wider text-slate-600">
                    {formatDate(g.created_at)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Auth codes */}
      <div>
        <h3 className="mb-2 text-sm font-medium text-slate-300">
          Auth codes ({codes.length})
        </h3>
        {codes.length === 0 ? (
          <p className="text-xs text-slate-500">
            No codes generated yet.
          </p>
        ) : (
          <div className="space-y-2">
            {codes.map((c) => {
              const statusColor =
                c.status === "used"
                  ? "text-emerald-400"
                  : c.status === "expired" || c.isExpired
                  ? "text-red-400"
                  : "text-yellow-400";
              const statusLabel =
                c.status === "used"
                  ? "Used"
                  : c.status === "expired" || c.isExpired
                  ? "Expired"
                  : "Pending";
              return (
                <div
                  key={c.id}
                  className="rounded-lg border border-slate-700 bg-slate-800/50 p-3"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span
                        className={`font-mono text-lg tracking-wider ${statusColor}`}
                      >
                        {c.code}
                      </span>
                      {c.groupName && (
                        <p className="mt-1 text-xs text-slate-400 truncate max-w-[200px]">
                          → {c.groupName}
                          {c.groupJid ? ` (${c.groupJid.slice(0, 12)}…)` : ""}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <span className={`text-xs ${statusColor}`}>
                        {statusLabel}
                      </span>
                      <p className="text-[10px] text-slate-600 mt-0.5">
                        {formatDate(c.createdAt)}
                        {c.expiresAt && (
                          <> → {formatDate(c.expiresAt)}</>
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {!isAdmin && (
        <p className="text-xs text-slate-500">
          Only owners and admins can create auth codes.
        </p>
      )}
    </div>
  );
}
