"use client";

import {
  DashboardReportRow,
  PendingWhatsAppGroupCard,
} from "@/components/dashboard-grid";
import { ProofConfigWidget } from "@/components/proof-config/proof-config-widget";
import { Reveal } from "@/components/wallnut/reveal";
import type { ProofAdminSettings } from "@/lib/proof/proof-settings";
import type { ProofPipelineMode } from "@/lib/proof/pipeline-mode";
import type { GroupCard, PendingWhatsAppInvite, ReportRow } from "@/lib/groups-presentation";

export function PublicDashboard({
  orgSlug,
  cards,
  pendingInvites = [],
  canManageGroups = false,
  canManageProofConfig = false,
  proofAdminSettings,
  proofPipelineMode = "split",
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
  proofPipelineMode?: ProofPipelineMode;
}) {
  const reports = flattenPublicReports(cards);
  const allEmpty = reports.length === 0 && pendingInvites.length === 0;

  return (
    <section className="mx-auto w-full max-w-[680px] pb-8 pt-2">
      <Reveal dramatic>
        <h1 className="text-center text-[clamp(25px,4vw,34px)] font-bold leading-none tracking-[-0.8px] text-white">
          Public
        </h1>
      </Reveal>

      {reports.length > 0 ? (
        <Reveal dramatic delayMs={120}>
          <article className="mt-8 overflow-hidden rounded-[8px] border border-[#222222] bg-[#060606] shadow-[0_24px_36px_rgba(0,0,0,0.48)]">
            <div className="flex flex-col gap-1 px-4 py-3">
              {reports.map((report) => (
                <DashboardReportRow key={report.assetId} report={report} />
              ))}
            </div>
          </article>
        </Reveal>
      ) : null}

      {allEmpty ? (
        <Reveal dramatic delayMs={120}>
          <div className="mt-10 rounded-[8px] border border-dashed border-[#222222] px-6 py-14 text-center">
            <p className="text-[12px] font-bold text-[#bdbdbd]">Nothing in Public yet</p>
            <p className="mt-1 text-[11px] text-[#5f5f5f]">
              When someone messages Wallnut on WhatsApp, their proofs appear here.
            </p>
          </div>
        </Reveal>
      ) : null}

      {pendingInvites.length > 0 ? (
        <Reveal dramatic delayMs={180}>
          <div className="mt-8 flex flex-col gap-3">
            {pendingInvites.map((invite, index) => (
              <Reveal key={invite.id} dramatic delayMs={220 + index * 70}>
                <PendingWhatsAppGroupCard
                  invite={invite}
                  orgSlug={orgSlug}
                  defaultOpen={false}
                  canRemove={canManageGroups}
                />
              </Reveal>
            ))}
          </div>
        </Reveal>
      ) : null}

      {canManageProofConfig ? (
        <Reveal dramatic delayMs={260}>
          <div className="mt-8 flex justify-center">
            <ProofConfigWidget
              orgSlug={orgSlug}
              initialSettings={proofAdminSettings}
              pipelineMode={proofPipelineMode}
            />
          </div>
        </Reveal>
      ) : null}
    </section>
  );
}

function flattenPublicReports(cards: GroupCard[]): ReportRow[] {
  return cards
    .flatMap((card) => card.reports)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.name.localeCompare(b.name));
}
