"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Spinner } from "@/components/wallnut/icons";
import { WALLNUT_BUTTON, WALLNUT_PANEL } from "@/components/wallnut/panel";
import type { GroupCard } from "@/lib/groups-presentation";

export function OnboardingChecklist({
  cards,
  hasInvite,
  canAddGroup,
  isSuperAdmin,
  onAddGroup,
  addingGroup,
}: {
  cards: GroupCard[];
  hasInvite: boolean;
  canAddGroup: boolean;
  isSuperAdmin: boolean;
  onAddGroup: () => void;
  addingGroup: boolean;
}) {
  const [whatsappStatus, setWhatsappStatus] = useState<string | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/whatsapp/session", { cache: "no-store" });
        const data = await response.json();
        if (!cancelled) setWhatsappStatus(typeof data.status === "string" ? data.status : null);
      } catch {
        if (!cancelled) setWhatsappStatus(null);
      } finally {
        if (!cancelled) setLoadingStatus(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const whatsappConnected = whatsappStatus === "WORKING";
  const hasLinkedGroup = cards.some(
    (card) =>
      card.reports.length > 0 ||
      (card.group.external_id?.endsWith("@g.us") && !card.inviteCode),
  );
  const hasReports = cards.some((card) => card.reports.length > 0);

  const steps = [
    {
      title: "Connect WhatsApp",
      description: whatsappConnected
        ? "Wallnut is paired and ready to receive messages."
        : isSuperAdmin
          ? "Pair the shared WhatsApp number so Wallnut can read group chats."
          : "A super admin needs to pair WhatsApp first (Connect in the account menu).",
      done: whatsappConnected,
      action: !whatsappConnected && isSuperAdmin ? (
        <Link href="/connect" className={WALLNUT_BUTTON}>
          Open Connect
        </Link>
      ) : null,
    },
    {
      title: "Create a link code",
      description: canAddGroup
        ? "Generate a one-time code for the WhatsApp group you want to sync."
        : "Ask an owner or admin to create a link code for your group.",
      done: hasInvite,
      action:
        canAddGroup && !hasInvite ? (
          <button
            type="button"
            onClick={onAddGroup}
            disabled={addingGroup}
            aria-busy={addingGroup}
            className={WALLNUT_BUTTON}
          >
            {addingGroup ? <Spinner /> : null}
            {addingGroup ? "Creating code…" : "Add WhatsApp group"}
          </button>
        ) : null,
    },
    {
      title: "Paste the code in your group chat",
      description:
        "Send the code as a message in the WhatsApp group. Wallnut will confirm when the group is linked.",
      done: hasLinkedGroup,
      action: null,
    },
    {
      title: "Send an image or PDF",
      description:
        "Post a photo or PDF in the linked group. Wallnut will proof it and add a report here.",
      done: hasReports,
      action: null,
    },
  ];

  const completedCount = steps.filter((step) => step.done).length;
  if (hasReports) return null;

  return (
    <article className={WALLNUT_PANEL}>
      <div className="border-b border-[#222] px-4 py-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#6c6c6c]">
          Getting started
        </p>
        <h2 className="mt-1 text-[13px] font-bold text-white">Set up your first report</h2>
        <p className="mt-1 text-[11px] text-[#6c6c6c]">
          {completedCount} of {steps.length} steps complete
          {loadingStatus && !whatsappConnected ? " · checking WhatsApp…" : ""}
        </p>
      </div>

      <ol className="divide-y divide-[#1b1b1b]">
        {steps.map((step, index) => (
          <li key={step.title} className="flex gap-3 px-4 py-4">
            <span
              aria-hidden
              className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-bold ${
                step.done
                  ? "bg-[#1a2e1f] text-[#4ade80]"
                  : index === completedCount
                    ? "border border-[#3a3a3a] bg-[#161616] text-[#bdbdbd]"
                    : "border border-[#252525] bg-[#121212] text-[#555]"
              }`}
            >
              {step.done ? "✓" : index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p
                className={`text-[12px] font-bold ${
                  step.done ? "text-[#6c6c6c] line-through" : "text-[#fbfbfb]"
                }`}
              >
                {step.title}
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-[#6c6c6c]">{step.description}</p>
              {step.action ? <div className="mt-3">{step.action}</div> : null}
            </div>
          </li>
        ))}
      </ol>
    </article>
  );
}
