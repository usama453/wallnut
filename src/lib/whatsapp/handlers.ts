import { createAdminClient } from "@/lib/supabase/server";
import { runProof } from "@/lib/proof/runProof";
import { proofSemaphore } from "@/lib/proof/concurrency";
import { getProvider } from "@/lib/ai";
import { createAssetVersionFromBytes } from "@/lib/assets";
import { downloadMedia, sendInteractive, sendText } from "./client";
import { logUsage } from "./usage";
import { summarizeIssues, reportStatus } from "@/lib/reportSummary";
import { extractMedia, isButtonReply, getButtonReplyId, extractPhoneNumberId } from "./webhook";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

/** Outbound interactive messages awaiting delivery, keyed by message id → text fallback. */
const pendingFallbacks = new Map<
  string,
  { from: string; text: string; groupId?: string; replyToMessageId?: string }
>();

/** Best-effort dedupe of inbound message ids (Meta retries batches we take too long on). */
const seenMessages = new Map<string, number>();
const SEEN_TTL_MS = 10 * 60 * 1000;

/** Per-sender counter so untitled images in a burst get distinct names. */
const imageCounters = new Map<string, number>();

export interface WhatsAppWebhookResult {
  handled: boolean;
  action: "media" | "button" | "text" | "ignored";
}

/**
 * Entry point for a single WhatsApp message event (may contain many messages).
 * - image/document → proof it and reply with the score card
 * - interactive button reply → apply approval status and confirm
 * - anything else → ignore
 */
export async function handleWhatsAppMessageEvent(event: any): Promise<WhatsAppWebhookResult> {
  const value = event?.value ?? event?.entry?.[0]?.changes?.[0]?.value;
  const phoneNumberId = extractPhoneNumberId(value);

  // Store the raw payload for the webhook viewer (best-effort).
  storeWebhookEvent(value, phoneNumberId).catch(() => {});

  // Delivery/read receipts arrive as status events.
  if (value?.statuses?.length) {
    const s = value.statuses[0];
    const err = JSON.stringify(s.errors ?? []).slice(0, 300);
    console.log(`[whatsapp] status ${s.status} id=${s.id}${err ? " err=" + err : ""}`);
    logUsage({
      direction: "outbound",
      msg_type: "status",
      message_id: s.id,
      status: s.status,
      error_code: s.errors?.[0]?.code ? String(s.errors[0].code) : undefined,
      error_detail: err || undefined,
    });
    // Interactive cards can be filtered by WhatsApp (131026). Fall back to plain
    // text (score + link) which delivers reliably, so the user never loses the result.
    if (s.status === "failed" && s.id) {
      const pending = pendingFallbacks.get(s.id);
      if (pending) {
        pendingFallbacks.delete(s.id);
        await sendText(pending.from, pending.text, pending.groupId, pending.replyToMessageId, phoneNumberId).catch(() => {});
        console.log(`[whatsapp] fallback text sent for failed msg ${s.id}`);
      }
    }
    return { handled: false, action: "ignored" };
  }

  const messages = value?.messages ?? [];
  console.log(`[whatsapp] inbound event messageCount=${messages.length}`);

  let handled = false;
  let lastAction: WhatsAppWebhookResult["action"] = "ignored";
  for (const message of messages) {
    if (!message?.from) continue;
    // Skip retries of messages we already processed.
    if (isSeen(message.id)) {
      console.log(`[whatsapp] skipping already-processed message ${message.id}`);
      continue;
    }
    markSeen(message.id);
    const groupId = message?.context?.group_id ?? undefined;
    console.log(`[whatsapp] dispatch msgId=${message.id} type=${message.type} from=${message.from}${groupId ? ` group=${groupId}` : ""}${phoneNumberId ? ` phone=${phoneNumberId}` : ""}`);
    logUsage({
      direction: "inbound",
      msg_type: message.type,
      message_id: message.id,
      from_phone: message.from,
      group_id: groupId,
    });
    const result = await dispatchMessage(message, groupId, phoneNumberId);
    handled = handled || result.handled;
    lastAction = result.action;
  }
  return { handled, action: lastAction };
}

async function dispatchMessage(
  message: any,
  groupId: string | undefined,
  phoneNumberId?: string,
): Promise<WhatsAppWebhookResult> {
  const from = message.from;

  if (isButtonReply(message)) {
    return await handleButtonReply(from, message, groupId, phoneNumberId);
  }

  const media = extractMedia(message);
  if (media) {
    return await handleMedia(from, media, message, groupId, phoneNumberId);
  }

  if (message.type === "text") {
    console.log(`[whatsapp] text from ${from}: ${(message.text?.body ?? "").slice(0, 120)}`);
    await sendText(from, INTRO_LINES, groupId, message.id, phoneNumberId);
    return { handled: true, action: "text" };
  }

  return { handled: false, action: "ignored" };
}

/** Best-effort intro for new conversations: demo notice, group access, and contact link. */
const INTRO_LINES = [
  "Hey! I'm Wallnut — your AI proofing tortoise 🐢",
  "I check marketing images and PDFs for spelling, grammar, brand issues, CTAs, contrast, safe margins and more — and give you a score in seconds.",
  "Send me an image or a PDF and I'll run a full proof right here in WhatsApp.",
  "━━━━━━━━━━━━",
  "🚧 I'm currently running in demo mode. Some features may be limited.",
  "👥 Want to use me in group chats? Request access here:",
  "https://usama.fun/wallnut/",
  "",
  "Questions, feedback or partnership inquiries:",
  "https://usama.fun/wallnut/",
].join("\n");

/** Casual chat reply in the tortoise persona, with a reliable offline fallback. */
async function chatReply(message: string): Promise<string> {
  const fallback =
    "Hey! I'm Wallnut — your AI proofing tortoise 🐢\n\n" +
    "Send me an image or a PDF and I'll run a full proof and get you a score.\n\n" +
    "🚧 Running in demo mode. Want group chat access? Visit: https://usama.fun/wallnut/";
  if (!message) return fallback;
  try {
    return await getProvider().chat(message);
  } catch (err) {
    console.error(`[whatsapp] chat failed, using fallback: ${err instanceof Error ? err.message : err}`);
    return fallback;
  }
}

function isSeen(id?: string): boolean {
  if (!id) return false;
  const at = seenMessages.get(id);
  if (!at) return false;
  if (Date.now() - at > SEEN_TTL_MS) {
    seenMessages.delete(id);
    return false;
  }
  return true;
}

function markSeen(id?: string) {
  if (!id) return;
  seenMessages.set(id, Date.now());
  if (seenMessages.size > 500) {
    const now = Date.now();
    for (const [k, v] of seenMessages) {
      if (now - v > SEEN_TTL_MS) seenMessages.delete(k);
    }
  }
}

async function handleMedia(
  from: string,
  media: { mediaId: string; mime: string },
  message: any,
  groupId?: string,
  phoneNumberId?: string,
): Promise<WhatsAppWebhookResult> {
  try {
    const bytes = await downloadMedia(media.mediaId, phoneNumberId);
    const kind = media.mime === "application/pdf" ? "pdf" : "image";

    const orgId = await resolveOrgId(from, phoneNumberId);

    const providedName = message?.image?.caption || message?.document?.filename;
    const count = (imageCounters.get(from) ?? 0) + 1;
    imageCounters.set(from, count);
    const name =
      providedName ||
      `WhatsApp upload${count > 1 ? ` #${count}` : ""}${groupId ? ` (group)` : ""}`;

    const created = await createAssetVersionFromBytes({
      orgId,
      name: name,
      mime: media.mime,
      kind,
      bytes,
    });

    // Cap concurrent AI proofs so a burst of uploads doesn't blow Gemini's rate limit.
    const result = await proofSemaphore.run(() => runProof(created.versionId));
    console.log(`[whatsapp] proof done for ${created.assetId} score=${result.report.score}`);
    logUsage({
      direction: "inbound",
      msg_type: "proof",
      from_phone: from,
      group_id: groupId,
      status: String(result.report.score),
      asset_id: created.assetId,
    });

    const reportUrl = `${APP_URL}/r/${created.slug}`;

    // Compact category summary, e.g. "1 grammar, 2 nouns, 1 visual".
    const summaryLine = summarizeIssues(result.report.issues);
    const status = reportStatus(result.report.issues);

    const detailBody =
      `${status.emoji} ${status.label}\n` +
      (summaryLine ? summaryLine : "") +
      `\n\n${reportUrl}`;

    // Single reply: interactive card with summary + report link + approve/request
    // buttons. If WhatsApp filters the card (code 131026), the failed-status
    // fallback below re-sends the plain text so the result is never lost.
    const msgId = await sendInteractive(
      from,
      detailBody,
      {
        reply: [
          { id: `approve:${created.assetId}:${created.version}`, title: "Approve" },
          { id: `changes:${created.assetId}:${created.version}`, title: "Request changes" },
        ],
        url: [{ url: reportUrl, title: "View Report" }],
      },
      groupId,
      message.id,
      phoneNumberId,
    );
    if (msgId)
      pendingFallbacks.set(msgId, { from, text: detailBody, groupId, replyToMessageId: message.id });

    return { handled: true, action: "media" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "something went wrong";
    console.error(`[whatsapp] media proof failed: ${message}`);
    await sendText(from, `Sorry, I couldn't proof that: ${message}`, groupId, undefined, phoneNumberId).catch(() => {});
    return { handled: true, action: "media" };
  }
}

async function handleButtonReply(
  from: string,
  message: any,
  groupId?: string,
  phoneNumberId?: string,
): Promise<WhatsAppWebhookResult> {
  const replyId = getButtonReplyId(message) ?? "";
  const [, assetId, versionStr] = replyId.split(":");
  if (!assetId) return { handled: false, action: "ignored" };

  const status = replyId.startsWith("approve") ? "approved" : "changes_requested";
  const version = Number(versionStr ?? 1);

  try {
    const admin = await createAdminClient();
    const { data: asset } = await admin
      .from("assets")
      .select("id, name, slug")
      .eq("id", assetId)
      .maybeSingle();
    if (!asset) throw new Error("asset not found");

    await admin.from("assets").update({ status }).eq("id", assetId);
    await admin.from("approvals").insert({
      asset_id: assetId,
      version,
      status,
      comment: `Approved via WhatsApp (${from})`,
    });

    const reportUrl = `${APP_URL}/r/${asset.slug ?? asset.id}`;
    const confirmation =
      status === "approved"
        ? `Got it — "${asset.name}" is approved ✅`
        : `Noted — changes requested for "${asset.name}" ⚠️`;
    const msgId = await sendInteractive(
      from,
      confirmation,
      { url: [{ url: reportUrl, title: "View Report" }] },
      groupId,
      undefined,
      phoneNumberId,
    );
    if (msgId) pendingFallbacks.set(msgId, { from, text: `${confirmation}\nOpen report: ${reportUrl}`, groupId });
    logUsage({
      direction: "inbound",
      msg_type: "approval",
      from_phone: from,
      group_id: groupId,
      status,
      asset_id: assetId,
    });
    return { handled: true, action: "button" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    await sendText(from, `Sorry, I couldn't apply that: ${msg}`, groupId, undefined, phoneNumberId).catch(() => {});
    return { handled: true, action: "button" };
  }
}

/** Map an inbound event to an org: provider connection org > env default > known contact > null. */
async function resolveOrgId(phone: string, phoneNumberId?: string): Promise<string | null> {
  if (phoneNumberId) {
    try {
      const admin = await createAdminClient();
      const { data } = await admin
        .from("provider_phones")
        .select("org_id")
        .eq("phone_number_id", phoneNumberId)
        .maybeSingle();
      if (data?.org_id) return data.org_id;
    } catch {
      // fall through
    }
  }

  const fromEnv = process.env.WHATSAPP_DEFAULT_ORG_ID;
  if (fromEnv) return fromEnv;

  try {
    const admin = await createAdminClient();
    const { data } = await admin
      .from("whatsapp_contacts")
      .select("org_id")
      .eq("phone", phone)
      .maybeSingle();
    return data?.org_id ?? null;
  } catch {
    return null;
  }
}

/** Best-effort persistence of raw webhook payloads for the debug viewer. */
async function storeWebhookEvent(value: any, phoneNumberId?: string) {
  try {
    const admin = await createAdminClient();
    const wabaId = value?.metadata?.waba_id ?? null;
    await admin.from("webhook_events").insert({
      direction: "inbound",
      phone_number_id: phoneNumberId ?? null,
      waba_id: wabaId ? String(wabaId) : null,
      payload: value ?? {},
    });
  } catch (err) {
    console.error(`[whatsapp] webhook store failed: ${err instanceof Error ? err.message : err}`);
  }
}
