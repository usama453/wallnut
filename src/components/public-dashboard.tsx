"use client";

import { DashboardGroupCard, PendingWhatsAppGroupCard } from "@/components/dashboard-grid";
import { Reveal } from "@/components/wallnut/reveal";
import type { GroupCard, PendingWhatsAppInvite } from "@/lib/groups-presentation";
import {
  categorizePublicInbox,
  publicCardPresentation,
  timeAgo,
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
  canManageGroups?: boolean;
}) {
  const inbox = categorizePublicInbox(cards);

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
            Everything here arrived before being assigned to a team workspace — private
            WhatsApp chats on the left, unlinked group proofs below.
          </p>
          <dl className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-[12px] text-[#bdbdbd]">
            <div>
              <dt className="sr-only">Reports</dt>
              <dd>
                <span className="font-bold text-white">{stats.reports}</span> proofs
              </dd>
            </div>
            <div>
              <dt className="sr-only">Private chats</dt>
              <dd>
                <span className="font-bold text-white">{inbox.privateChats.length}</span> private chat
                {inbox.privateChats.length === 1 ? "" : "s"}
              </dd>
            </div>
            <div>
              <dt className="sr-only">Group proofs</dt>
              <dd>
                <span className="font-bold text-white">{inbox.groupProofs.length}</span> group proof
                {inbox.groupProofs.length === 1 ? "" : "s"}
              </dd>
            </div>
            <div>
              <dt className="sr-only">Idle groups</dt>
              <dd>
                <span className="font-bold text-white">{inbox.idleGroups.length}</span> idle group
                {inbox.idleGroups.length === 1 ? "" : "s"}
              </dd>
            </div>
          </dl>
        </header>
      </Reveal>

      <PublicSection
        title="Private chats"
        description="Contacts who sent Wallnut an image or PDF in a 1:1 WhatsApp chat."
        cards={inbox.privateChats}
        orgSlug={orgSlug}
        delayMs={120}
        emptyTitle="No private chats with proofs yet"
        emptyDescription="When someone sends Wallnut an image or PDF in a direct message, their chat appears here."
        defaultOpen
      />

      <PublicSection
        title="Direct messages archive"
        description="Older 1:1 proofs stored before Wallnut tracked each contact separately."
        cards={inbox.directArchive}
        orgSlug={orgSlug}
        delayMs={180}
        emptyTitle="No archived direct messages"
        emptyDescription="Legacy proofs from early direct-message traffic would appear in this bucket."
        defaultOpen
      />

      <PublicSection
        title="Unlinked group proofs"
        description="WhatsApp groups that sent proofable images or PDFs but are not assigned to a team workspace yet."
        cards={inbox.groupProofs}
        orgSlug={orgSlug}
        delayMs={240}
        emptyTitle="No unlinked group proofs"
        emptyDescription="To assign a group to a team, open that team's workspace and use Add WhatsApp group."
        defaultOpen
      />

      <PublicSection
        title="Idle groups"
        description="Groups Wallnut has seen on WhatsApp but that have not sent proofable media yet."
        cards={inbox.idleGroups}
        orgSlug={orgSlug}
        delayMs={300}
        emptyTitle="No idle groups"
        emptyDescription="Groups that message Wallnut without sending images or PDFs show up here."
      />

      {pendingInvites.length > 0 ? (
        <Reveal dramatic delayMs={360}>
          <section className="mt-10">
            <div className="mb-4">
              <h2 className="text-[13px] font-bold text-white">Stale link codes</h2>
              <p className="mt-1 max-w-lg text-[12px] leading-relaxed text-[#6c6c6c]">
                Leftover codes on Public. Link codes should be created from a team workspace,
                not here.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              {pendingInvites.map((invite, index) => (
                <Reveal key={invite.id} dramatic delayMs={400 + index * 70}>
                  <PendingWhatsAppGroupCard
                    invite={invite}
                    orgSlug={orgSlug}
                    defaultOpen={false}
                    canRemove={canManageGroups}
                  />
                </Reveal>
              ))}
            </div>
          </section>
        </Reveal>
      ) : null}
    </section>
  );
}

function PublicSection({
  title,
  description,
  cards,
  orgSlug,
  delayMs,
  emptyTitle,
  emptyDescription,
  defaultOpen = false,
}: {
  title: string;
  description: string;
  cards: GroupCard[];
  orgSlug: string;
  delayMs: number;
  emptyTitle: string;
  emptyDescription: string;
  defaultOpen?: boolean;
}) {
  return (
    <Reveal dramatic delayMs={delayMs}>
      <section className="mt-10">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-[13px] font-bold text-white">{title}</h2>
            <p className="mt-1 max-w-lg text-[12px] leading-relaxed text-[#6c6c6c]">
              {description}
            </p>
          </div>
          <span className="shrink-0 text-[11px] text-[#555]">
            {cards.length} source{cards.length === 1 ? "" : "s"}
          </span>
        </div>

        {cards.length > 0 ? (
          <div className="flex flex-col gap-3">
            {cards.map((card, index) => {
              const presentation = publicCardPresentation(card);
              const lastActiveLabel = presentation.lastActiveAt
                ? timeAgo(presentation.lastActiveAt)
                : undefined;
              return (
                <Reveal key={card.group.id} dramatic delayMs={delayMs + 60 + index * 70}>
                  <DashboardGroupCard
                    card={card}
                    orgSlug={orgSlug}
                    defaultOpen={defaultOpen && index === 0 && card.reports.length > 0}
                    groupLabel={presentation.title}
                    sourceBadge={presentation.badge}
                    sourceHint={presentation.hint}
                    emptyMessage={presentation.emptyMessage}
                    lastActiveLabel={lastActiveLabel}
                  />
                </Reveal>
              );
            })}
          </div>
        ) : (
          <div className="rounded-[8px] border border-dashed border-[#252525] px-6 py-10 text-center">
            <p className="text-[12px] font-bold text-[#bdbdbd]">{emptyTitle}</p>
            <p className="mt-1 text-[11px] text-[#5f5f5f]">{emptyDescription}</p>
          </div>
        )}
      </section>
    </Reveal>
  );
}
