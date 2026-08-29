"use client";

import { DashboardGroupCard, PendingWhatsAppGroupCard } from "@/components/dashboard-grid";
import { Reveal } from "@/components/wallnut/reveal";
import type { GroupCard, PendingWhatsAppInvite } from "@/lib/groups-presentation";
import {
  categorizePublicCards,
  displayPublicUnlinkedGroupName,
  isDirectMessagesBucket,
} from "@/lib/groups-presentation";

export function PublicDashboard({
  orgSlug,
  cards,
  stats,
  pendingInvites = [],
  canManageGroups = false,
}: {
  orgSlug: string;
  cards: GroupCard[];
  stats: {
    groups: number;
    reports: number;
    filesChecked: number;
    issues: number;
    members: number;
  };
  pendingInvites?: PendingWhatsAppInvite[];
  /** Super admins can dismiss stale link codes left on Public by mistake. */
  canManageGroups?: boolean;
}) {
  const { directMessages, unlinkedGroups } = categorizePublicCards(cards);
  const hasLegacyBucket = directMessages.some((card) => isDirectMessagesBucket(card.group));
  const hasIndividualDms = directMessages.some((card) => !isDirectMessagesBucket(card.group));

  return (
    <section className="mx-auto w-full max-w-3xl pb-8 pt-2">
      <Reveal dramatic>
        <header>
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#6c6c6c]">
            Catch-all workspace
          </p>
          <h1 className="mt-2 text-[clamp(26px,4vw,34px)] font-bold leading-tight tracking-[-0.8px] text-white">
            Public
          </h1>
          <p className="mt-3 max-w-xl text-[13px] leading-relaxed text-[#919191]">
            Private WhatsApp chats and groups that are not linked to a team workspace yet.
            Proofs land here automatically — you do not add groups from this page.
          </p>
          <dl className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-[12px] text-[#bdbdbd]">
            <div>
              <dt className="sr-only">Reports</dt>
              <dd>
                <span className="font-bold text-white">{stats.reports}</span> reports
              </dd>
            </div>
            <div>
              <dt className="sr-only">Direct chats</dt>
              <dd>
                <span className="font-bold text-white">{directMessages.length}</span> direct chat
                {directMessages.length === 1 ? "" : "s"}
              </dd>
            </div>
            <div>
              <dt className="sr-only">Unlinked groups</dt>
              <dd>
                <span className="font-bold text-white">{unlinkedGroups.length}</span> unlinked group
                {unlinkedGroups.length === 1 ? "" : "s"}
              </dd>
            </div>
          </dl>
        </header>
      </Reveal>

      {directMessages.length > 0 ? (
        <Reveal dramatic delayMs={120}>
          <section className="mt-10">
            <div className="mb-4">
              <h2 className="text-[13px] font-bold text-white">Direct messages</h2>
              <p className="mt-1 text-[12px] leading-relaxed text-[#6c6c6c]">
                Proofs sent in 1:1 chats with Wallnut.
                {hasLegacyBucket && hasIndividualDms
                  ? " Older proofs are grouped under Direct messages; newer chats appear separately."
                  : null}
              </p>
            </div>
            <div className="flex flex-col gap-3">
              {directMessages.map((card, index) => (
                <Reveal key={card.group.id} dramatic delayMs={180 + index * 70}>
                  <DashboardGroupCard
                    card={card}
                    orgSlug={orgSlug}
                    defaultOpen={
                      isDirectMessagesBucket(card.group)
                        ? card.reports.length > 0
                        : false
                    }
                  />
                </Reveal>
              ))}
            </div>
          </section>
        </Reveal>
      ) : null}

      <Reveal dramatic delayMs={220}>
        <section className="mt-10">
          <div className="mb-4">
            <h2 className="text-[13px] font-bold text-white">Unlinked groups</h2>
            <p className="mt-1 max-w-lg text-[12px] leading-relaxed text-[#6c6c6c]">
              Groups appear here when they message Wallnut before being assigned to a team.
              To link one, open that team&apos;s workspace and use{" "}
              <span className="text-[#919191]">Add WhatsApp group</span> there.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            {pendingInvites.map((invite, index) => (
              <Reveal key={invite.id} dramatic delayMs={280 + index * 70}>
                <PendingWhatsAppGroupCard
                  invite={invite}
                  orgSlug={orgSlug}
                  defaultOpen={false}
                  canRemove={canManageGroups}
                />
              </Reveal>
            ))}

            {unlinkedGroups.length > 0 ? (
              unlinkedGroups.map((card, index) => (
                <Reveal key={card.group.id} dramatic delayMs={340 + (pendingInvites.length + index) * 70}>
                  <DashboardGroupCard
                    card={card}
                    orgSlug={orgSlug}
                    defaultOpen={pendingInvites.length === 0 && index === 0 && card.reports.length > 0}
                    groupLabel={displayPublicUnlinkedGroupName(card.group)}
                  />
                </Reveal>
              ))
            ) : pendingInvites.length === 0 ? (
              <div className="rounded-[8px] border border-dashed border-[#252525] px-6 py-12 text-center">
                <p className="text-[12px] font-bold text-[#bdbdbd]">No unlinked groups</p>
                <p className="mt-1 text-[11px] text-[#5f5f5f]">
                  When a WhatsApp group messages Wallnut before it is linked to a team, it will
                  show up here.
                </p>
              </div>
            ) : null}
          </div>
        </section>
      </Reveal>
    </section>
  );
}
