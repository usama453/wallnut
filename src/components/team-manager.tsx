"use client";

import { useCallback, useEffect, useState } from "react";

interface Member {
  id: string;
  user_id: string | null;
  role: string;
  email: string | null;
  created_at: string;
}
interface Invite {
  id: string;
  invited_email: string;
  role: string;
  created_at: string;
}
type Role = "owner" | "admin" | "member" | "viewer";

const ROLE_LABEL: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
};

const ROLE_ORDER: Record<Role, number> = { owner: 0, admin: 1, member: 2, viewer: 3 };

export function TeamManager({ orgSlug }: { orgSlug?: string }) {
  const [myRole, setMyRole] = useState<Role>("member");
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("member");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        orgSlug ? `/api/org/members?org=${encodeURIComponent(orgSlug)}` : "/api/org/members",
      );
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load");
      const data = await res.json();
      setMyRole(data.role);
      const sorted = [...(data.members ?? [])].sort(
        (a: Member, b: Member) => ROLE_ORDER[a.role as Role] - ROLE_ORDER[b.role as Role],
      );
      setMembers(sorted);
      setInvites(data.invites ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [orgSlug]);

  useEffect(() => {
    void load();
  }, [load]);

  const canInvite = myRole === "owner" || myRole === "admin";
  const canRemove = canInvite;

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/org/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, org: orgSlug }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Request failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  function invite() {
    if (!email.trim()) return;
    void post({ action: "invite", email, role: inviteRole })
      .then(() => setEmail(""))
      .then(() => setNotice("Invite sent. They'll join your org when they sign up."));
  }

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-red-400">{error}</p>}
      {notice && <p className="text-sm text-emerald-400">{notice}</p>}

      {/* Invite by email */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
        <h2 className="text-sm font-semibold">Invite by email</h2>
        <p className="mt-1 text-xs text-slate-400">
          {invites.length > 0
            ? `${invites.length} pending invite${invites.length === 1 ? "" : "s"} — they join automatically when the email signs up.`
            : "Invite a teammate by email. They join your workspace when they create an account."}
        </p>

        {!canInvite ? (
          <p className="mt-3 text-xs text-amber-400">
            Only owners and admins can invite members.
          </p>
        ) : (
          <form
            className="mt-4 flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              invite();
            }}
          >
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@company.com"
              className="min-w-64 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-indigo-500"
              required
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as Role)}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none"
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
              <option value="viewer">Viewer</option>
            </select>
            <button
              type="submit"
              disabled={busy || !email.trim()}
              className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold hover:bg-indigo-400 disabled:opacity-50"
            >
              Send invite
            </button>
          </form>
        )}
      </div>

      {/* Members */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50">
        <div className="border-b border-slate-800 px-5 py-3">
          <h2 className="text-sm font-semibold">Members ({members.length})</h2>
        </div>
        {loading ? (
          <p className="px-5 py-8 text-sm text-slate-500">Loading…</p>
        ) : members.length === 0 ? (
          <p className="px-5 py-8 text-sm text-slate-500">No members yet.</p>
        ) : (
          <ul className="divide-y divide-slate-800/70">
            {members.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{m.user_id === "you" ? "You" : (m.email ?? "Member")}</p>
                  <p className="text-xs text-slate-500">{m.email}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="rounded-full border border-slate-700 px-2.5 py-0.5 text-xs text-slate-300">
                    {ROLE_LABEL[m.role as Role] ?? m.role}
                  </span>
                  {canRemove && m.role !== "owner" ? (
                    <button
                      onClick={() => void post({ action: "remove", id: m.id })}
                      disabled={busy}
                      className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Pending invites */}
      {invites.length > 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/50">
          <div className="border-b border-slate-800 px-5 py-3">
            <h2 className="text-sm font-semibold">Pending invites ({invites.length})</h2>
          </div>
          <ul className="divide-y divide-slate-800/70">
            {invites.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm">{inv.invited_email}</p>
                  <p className="text-xs text-slate-500">
                    {ROLE_LABEL[inv.role as Role] ?? inv.role} · awaiting signup
                  </p>
                </div>
                {canInvite ? (
                  <button
                    onClick={() => void post({ action: "remove", id: inv.id })}
                    disabled={busy}
                    className="shrink-0 text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
