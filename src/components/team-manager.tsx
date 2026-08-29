"use client";

import { useCallback, useEffect, useState } from "react";
import { Spinner } from "@/components/wallnut/icons";

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

const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
  "super admin": "Super admin",
  super_admin: "Super admin",
};

const ROLE_ORDER: Record<string, number> = {
  "super admin": 0,
  super_admin: 0,
  owner: 1,
  admin: 2,
  member: 3,
  viewer: 4,
};

const PANEL =
  "overflow-hidden rounded-[8px] border border-[#1b1b1b] bg-[#101010] shadow-[0_24px_36px_rgba(0,0,0,0.48)]";
const FIELD =
  "rounded-[6px] border border-[#2e2e2e] bg-[#161616] px-3 py-2 text-[12px] text-[#fbfbfb] outline-none placeholder:text-[#555] focus:border-[#3a3a3a]";

export function TeamManager({ orgSlug }: { orgSlug?: string }) {
  const [myRole, setMyRole] = useState<Role>("member");
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("member");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
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
    const key =
      body.action === "invite"
        ? "invite"
        : `${String(body.action)}:${String(body.id ?? "")}`;
    setBusy(key);
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
      setBusy(null);
    }
  }

  function invite() {
    if (!email.trim()) return;
    void post({ action: "invite", email, role: inviteRole })
      .then(() => setEmail(""))
      .then(() => setNotice("Invite sent. They'll join your org when they sign up."));
  }

  return (
    <div className="flex w-full flex-col gap-3">
      {error ? (
        <p role="alert" className="text-center text-[11px] text-[#e8b4b4]">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="text-center text-[11px] text-[#9ed4a8]">{notice}</p>
      ) : null}

      <article className={PANEL}>
        <div className="border-b border-[#222] px-4 py-3">
          <h2 className="text-[12px] font-bold text-[#fbfbfb]">Invite by email</h2>
          <p className="mt-1 text-[11px] text-[#6c6c6c]">
            {invites.length > 0
              ? `${invites.length} pending invite${invites.length === 1 ? "" : "s"} — they join automatically when the email signs up.`
              : "Invite a teammate by email. They join your workspace when they create an account."}
          </p>
        </div>

        <div className="px-4 py-4">
          {!canInvite ? (
            <p className="text-[11px] text-[#919191]">
              Only owners and admins can invite members.
            </p>
          ) : (
            <form
              className="flex flex-wrap items-center gap-2"
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
                className={`min-w-0 flex-1 ${FIELD}`}
                required
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as Role)}
                className={FIELD}
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
                <option value="viewer">Viewer</option>
              </select>
              <button
                type="submit"
                disabled={Boolean(busy) || !email.trim()}
                aria-busy={busy === "invite"}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#2e2e2e] bg-[#161616] px-3.5 py-2 text-[12px] text-[#fbfbfb] transition hover:border-[#3a3a3a] disabled:cursor-progress disabled:opacity-70"
              >
                {busy === "invite" ? <Spinner /> : null}
                {busy === "invite" ? "Sending…" : "Send invite"}
              </button>
            </form>
          )}
        </div>
      </article>

      <article className={PANEL}>
        <div className="border-b border-[#222] px-4 py-3">
          <h2 className="text-[12px] font-bold text-[#fbfbfb]">
            Members ({members.length})
          </h2>
        </div>
        {loading ? (
          <p className="px-4 py-8 text-center text-[11px] text-[#6c6c6c]">Loading…</p>
        ) : members.length === 0 ? (
          <p className="px-4 py-8 text-center text-[11px] text-[#6c6c6c]">No members yet.</p>
        ) : (
          <ul className="divide-y divide-[#1b1b1b]">
            {members.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-bold text-[#fbfbfb]">
                    {m.user_id === "you" ? "You" : (m.email ?? "Member")}
                  </p>
                  <p className="mt-0.5 text-[11px] capitalize text-[#6c6c6c]">
                    {ROLE_LABEL[m.role as Role] ?? m.role}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {canRemove && m.role !== "owner" ? (
                    <button
                      type="button"
                      onClick={() => void post({ action: "remove", id: m.id })}
                      disabled={Boolean(busy)}
                      aria-busy={busy === `remove:${m.id}`}
                      className="inline-flex items-center gap-1 text-[12px] text-[#919191] transition hover:text-[#e8b4b4] disabled:cursor-progress disabled:opacity-70"
                    >
                      {busy === `remove:${m.id}` ? <Spinner /> : null}
                      {busy === `remove:${m.id}` ? "Removing…" : "Remove"}
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </article>

      {invites.length > 0 ? (
        <article className={PANEL}>
          <div className="border-b border-[#222] px-4 py-3">
            <h2 className="text-[12px] font-bold text-[#fbfbfb]">
              Pending invites ({invites.length})
            </h2>
          </div>
          <ul className="divide-y divide-[#1b1b1b]">
            {invites.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-[12px] text-[#bdbdbd]">{inv.invited_email}</p>
                  <p className="mt-0.5 text-[10px] text-[#555]">
                    {ROLE_LABEL[inv.role as Role] ?? inv.role} · awaiting signup
                  </p>
                </div>
                {canInvite ? (
                  <button
                    type="button"
                    onClick={() => void post({ action: "remove", id: inv.id })}
                    disabled={Boolean(busy)}
                    aria-busy={busy === `remove:${inv.id}`}
                    className="inline-flex shrink-0 items-center gap-1 text-[12px] text-[#919191] transition hover:text-[#e8b4b4] disabled:cursor-progress disabled:opacity-70"
                  >
                    {busy === `remove:${inv.id}` ? <Spinner /> : null}
                    {busy === `remove:${inv.id}` ? "Canceling…" : "Cancel"}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </article>
      ) : null}
    </div>
  );
}
