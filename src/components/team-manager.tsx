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

export function TeamManager({
  orgSlug,
  onUpdated,
}: {
  orgSlug?: string;
  onUpdated?: () => void;
}) {
  const [myRole, setMyRole] = useState<Role>("member");
  const [isPublic, setIsPublic] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("member");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<{ id: string; label: string } | null>(
    null,
  );

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        orgSlug ? `/api/org/members?org=${encodeURIComponent(orgSlug)}` : "/api/org/members",
      );
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load");
      const data = await res.json();
      setMyRole(data.role);
      setIsPublic(Boolean(data.isPublic));
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
      onUpdated?.();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
      return false;
    } finally {
      setBusy(null);
    }
  }

  function invite() {
    if (!email.trim()) return;
    void post({ action: "invite", email, role: inviteRole })
      .then(() => setEmail(""))
      .then(() => setNotice(`Invite email sent to ${email.trim()}. They can sign up and set a password from that link.`));
  }

  async function confirmRemoveMember() {
    if (!removeTarget || busy) return;
    const ok = await post({ action: "remove", id: removeTarget.id });
    if (ok) setRemoveTarget(null);
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

      {isPublic ? (
        <article className={PANEL}>
          <div className="px-4 py-5">
            <h2 className="text-[12px] font-bold text-[#fbfbfb]">Open workspace</h2>
            <p className="mt-2 text-[12px] leading-relaxed text-[#919191]">
              Public is shared by every signed-in Wallnut user. There is no invite list —
              anyone with an account can open it from the workspace switcher.
            </p>
          </div>
        </article>
      ) : (
        <>
      <article className={PANEL}>
        <div className="border-b border-[#222] px-4 py-3">
          <h2 className="text-[12px] font-bold text-[#fbfbfb]">
            Invite someone to this dashboard
          </h2>
          <p className="mt-1 text-[11px] text-[#6c6c6c]">
            {invites.length > 0
              ? `${invites.length} pending invite${invites.length === 1 ? "" : "s"} — they join automatically when the email signs up.`
              : "If you want others to have access to this dashboard, invite them via email."}
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
                      onClick={() =>
                        setRemoveTarget({
                          id: m.id,
                          label: m.user_id === "you" ? "You" : (m.email ?? "this member"),
                        })
                      }
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
        </>
      )}

      {removeTarget ? (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/75 px-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="remove-member-title"
            className="w-full max-w-[360px] rounded-[10px] border border-[#1b1b1b] bg-[#101010] p-5 shadow-[0_24px_48px_rgba(0,0,0,0.55)]"
          >
            <h2 id="remove-member-title" className="text-[14px] font-bold text-[#fbfbfb]">
              Remove member?
            </h2>
            <p className="mt-2 text-[12px] leading-relaxed text-[#919191]">
              <span className="text-[#bdbdbd]">{removeTarget.label}</span> will lose access to
              this workspace. You can invite them again later.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRemoveTarget(null)}
                disabled={Boolean(busy)}
                className="rounded-full border border-[#2e2e2e] px-3.5 py-1.5 text-[12px] text-[#919191] transition hover:border-[#3a3a3a] hover:text-white disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmRemoveMember()}
                disabled={Boolean(busy)}
                aria-busy={busy === `remove:${removeTarget.id}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#4a2828] bg-[#1a1010] px-3.5 py-1.5 text-[12px] text-[#e8b4b4] transition hover:border-[#6a3838] disabled:cursor-progress disabled:opacity-70"
              >
                {busy === `remove:${removeTarget.id}` ? <Spinner /> : null}
                {busy === `remove:${removeTarget.id}` ? "Removing…" : "Remove member"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
