"use client";

import { DashboardGroupCard, PendingWhatsAppGroupCard } from "@/components/dashboard-grid";
import { ProofConfigWidget } from "@/components/proof-config/proof-config-widget";
import { Reveal } from "@/components/wallnut/reveal";
import type { ProofAdminSettings } from "@/lib/proof/proof-settings";
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
  canManageProofConfig = false,
  proofAdminSettings,
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
  canManageProofConfig?: boolean;
  proofAdminSettings?: ProofAdminSettings;
}) {
  const inbox = categorizePublicInbox(cards);

  const sections = [
    {
      key: "private-chats",
      title: "Private chats",
      description:
        "Contacts who sent Wallnut an image or PDF in a 1:1 WhatsApp chat.",
      cards: inbox.privateChats,
      delayMs: 120,
    },
    {
      key: "direct-archive",
      title: "Direct messages archive",
      description:
        "Older 1:1 proofs stored before Wallnut tracked each contact separately.",
      cards: inbox.directArchive,
      delayMs: 180,
    },
    {
      key: "group-proofs",
      title: "Unlinked group proofs",
      description:
        "WhatsApp groups that sent proofable images or PDFs but are not assigned to a team workspace yet.",
      cards: inbox.groupProofs,
      delayMs: 240,
    },
    {
      key: "idle-groups",
      title: "Idle groups",
      description:
        "Groups Wallnut has seen on WhatsApp but that have not sent proofable media yet.",
      cards: inbox.idleGroups,
      delayMs: 300,
    },
  ].filter((section) => section.cards.length > 0);

  const statItems = [
    { label: "proofs", value: stats.reports },
    inbox.privateChats.length > 0
      ? {
          label: `private chat${inbox.privateChats.length === 1 ? "" : "s"}`,
          value: inbox.privateChats.length,
        }
      : null,
    inbox.groupProofs.length > 0
      ? {
          label: `group proof${inbox.groupProofs.length === 1 ? "" : "s"}`,
          value: inbox.groupProofs.length,
        }
      : null,
    inbox.idleGroups.length > 0
      ? {
          label: `idle group${inbox.idleGroups.length === 1 ? "" : "s"}`,
          value: inbox.idleGroups.length,
        }
      : null,
  ].filter(Boolean) as Array<{ label: string; value: number }>;

  const allEmpty =
    sections.length === 0 && pendingInvites.length === 0;

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
            Everything here arrived before being assigned to a team workspace — sorted
            below by source type.
          </p>
          {statItems.length > 0 ? (
            <dl className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-[12px] text-[#bdbdbd]">
              {statItems.map((item) => (
                <div key={item.label}>
                  <dt className="sr-only">{item.label}</dt>
                  <dd>
                    <span className="font-bold text-white">{item.value}</span> {item.label}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
        </header>
      </Reveal>

      {allEmpty ? (
        <Reveal dramatic delayMs={120}>
          <div className="mt-10 rounded-[8px] border border-dashed border-[#252525] px-6 py-14 text-center">
            <p className="text-[12px] font-bold text-[#bdbdbd]">Nothing in Public yet</p>
            <p className="mt-1 text-[11px] text-[#5f5f5f]">
              When someone messages Wallnut on WhatsApp before a group is linked to a team,
              their traffic appears here.
            </p>
          </div>
        </Reveal>
      ) : null}

      {sections.map((section, index) => (
        <PublicSection
          key={section.key}
          title={section.title}
          description={section.description}
          cards={section.cards}
          orgSlug={orgSlug}
          delayMs={section.delayMs}
          defaultOpen={index === 0}
        />
      ))}

      {pendingInvites.length > 0 ? (
        <Reveal dramatic delayMs={360}>
          <section className="mt-10">
            <div className="mb-4">
              <h2 className="text-[13px] font-bold text-white">Unused link codes</h2>
              <p className="mt-1 max-w-lg text-[12px] leading-relaxed text-[#6c6c6c]">
                Leftover codes on Public. Create link codes from a team workspace instead.
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

      {canManageProofConfig ? (
        <Reveal dramatic delayMs={420}>
          <div className="mt-8">
            <ProofConfigWidget initialSettings={proofAdminSettings} />
          </div>
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
  defaultOpen = false,
}: {
  title: string;
  description: string;
  cards: GroupCard[];
  orgSlug: string;
  delayMs: number;
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
      </section>
    </Reveal>
  );
}
