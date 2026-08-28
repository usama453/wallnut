import { createAdminClient } from "@/lib/supabase/server";
import { runProof } from "@/lib/proof/runProof";
import { proofSemaphore } from "@/lib/proof/concurrency";
import { getProvider } from "@/lib/ai";
import { createAssetVersionFromBytes } from "@/lib/assets";
import { downloadMedia, sendInteractive, sendText, downloadMediaWaha, sendInteractiveWaha, sendTextWaha } from "./client";
import { logUsage } from "./usage";
import { formatCorrectionList, reportStatus } from "@/lib/reportSummary";
import { extractMedia, isButtonReply, getButtonReplyId, extractPhoneNumberId } from "./webhook";
import { getServerWamode, BOT_PHONE_NUMBER } from "./config";
import { loadAccessState, trackSeenChat } from "./access";

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
export async function handleWhatsAppMessageEvent(
  event: any,
  headers?: Headers,
): Promise<WhatsAppWebhookResult> {
  // Determine WAHA vs Meta mode
  const mode = headers ? getServerWamode(headers) : "meta";
  const isWaha = mode === "waha";

  const value = isWaha
    ? event // WAHA payload is the raw event
    : event?.value ?? event?.entry?.[0]?.changes?.[0]?.value;
  const phoneNumberId = isWaha
    ? BOT_PHONE_NUMBER || undefined // Waha: bot's own number, not the sender
    : extractPhoneNumberId(value); // Meta: from webhook metadata

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
          await (isWaha
            ? sendTextWaha(pending.from, pending.text, pending.replyToMessageId)
            : sendText(pending.from, pending.text, pending.groupId, pending.replyToMessageId, phoneNumberId)
          ).catch(() => {});
          console.log(`[whatsapp] fallback text sent for failed msg ${s.id}`);
        }
    }
    return { handled: false, action: "ignored" };
  }

  const messages = value?.messages ?? [];
  console.log(`[whatsapp] inbound event messageCount=${messages.length}`);

  let handled = false;
  let lastAction: WhatsAppWebhookResult["action"] = "ignored";
  const admin = await createAdminClient();
  for (const message of messages) {
    if (!message?.from) continue;
    // Skip retries of messages we already processed.
    if (isSeen(message.id)) {
      console.log(`[whatsapp] skipping already-processed message ${message.id}`);
      continue;
    }
    markSeen(message.id);
    const groupId = message?.context?.group_id ?? undefined;

    // For group messages, try to resolve org from the claimed groups table first.
    // This way a group belongs to the org that claimed it (via auth code), not
    // to whatever org the sender happens to be in.
    let groupOrgId: string | null = null;
    if (groupId) {
      groupOrgId = await resolveGroupOrg(admin, groupId);
    }

    // Response gating: only reply to allowed chats when allowlist mode is on.
    // Seen-chat tracking runs regardless so the dashboard can offer one-click allow.
    const orgId = groupOrgId ?? (await resolveOrgId(message.from, phoneNumberId));
    void trackSeenChat(admin, orgId, message.from, message.text?.body).catch(() => {});
    const cached =
      accessCache?.org === orgId && Date.now() - accessCache.at < ACCESS_TTL_MS;
    const state = cached && accessCache ? accessCache.state : await loadAccessState(admin, orgId);
    if (!cached) accessCache = { org: orgId, state, at: Date.now() };
    if (state.mode === "allowlist" && !state.allowed.has(message.from)) {
      console.log(`[whatsapp] ignored msg ${message.id}: chat not in allowlist`);
      logUsage({
        direction: "inbound",
        msg_type: message.type,
        message_id: message.id,
        from_phone: message.from,
        group_id: groupId,
        status: "not_allowed",
      });
      handled = true;
      lastAction = "ignored";
      continue;
    }

    logUsage({
      direction: "inbound",
      msg_type: message.type,
      message_id: message.id,
      from_phone: message.from,
      group_id: groupId,
    });

    // Auth-code claim: before normal dispatch, check whether this text message
    // in a group matches a pending auth code for the resolved org. If it does,
    // claim the group and skip normal dispatch.
    let claimedGroupId: string | null = null;
    if (groupId && message.type === "text") {
      const body = message.text?.body?.trim() ?? "";
      const claimed = await tryClaimGroupAuthCode(admin, orgId, groupId, body, phoneNumberId, mode);
      if (claimed.ok) {
        console.log(`[whatsapp] group ${groupId} claimed by auth code for org=${orgId}`);
        claimedGroupId = claimed.linkedGroupId;
        return { handled: true, action: "ignored" };
      }
    }

    const result = await dispatchMessage(message, groupId, phoneNumberId, mode, orgId, claimedGroupId);
    handled = handled || result.handled;
    lastAction = result.action;
  }
  return { handled, action: lastAction };
}

/** Short-lived cache of the access gate so bursts don't hammer the DB. */
let accessCache: {
  org: string | null;
  state: Awaited<ReturnType<typeof loadAccessState>>;
  at: number;
} | null = null;
const ACCESS_TTL_MS = 30 * 1000;

/**
 * True when a group message explicitly @mentions the bot. WhatsApp encodes
 * mentions as literal `@<full-number>` tokens inside the message body. When the
 * bot's own number is known (Meta payloads) we match against it; otherwise we
 * require the body to carry at least one `@<digits>` mention marker, so a
 * throwaway group text ("lol", "nice") never triggers — it must be
 * mention-directed.
 */
function wasMentioned(message: any, phoneNumberId?: string): boolean {
  const body: string = message?.text?.body ?? "";
  // No @-mention tokens at all → not directed at anyone, skip.
  const tokens = body.match(/@([0-9]{6,})/g) ?? [];
  if (tokens.length === 0) return false;

  // If we know the bot's own number, require the mention to match it.
  const bot = phoneNumberId ? String(phoneNumberId).replace(/\D/g, "") : "";
  if (bot && bot.length >= 6) {
    return tokens.some((t) => {
      const digits = t.replace(/\D/g, "");
      // Match against the last 10 digits (handles full international format).
      return digits.includes(bot.slice(-10)) || bot.includes(digits.slice(-10));
    });
  }

  // Bot number unknown (e.g. BOT_PHONE_NUMBER not configured in Waha mode):
  // require at least one @-mention to exist so throwaway group texts are skipped,
  // but accept any mention — the bot may still be the intended recipient.
  return true;
}

async function dispatchMessage(
  message: any,
  groupId: string | undefined,
  phoneNumberId?: string,
  mode: "meta" | "waha" = "meta",
  orgId?: string,
  claimedGroupId?: string | null,
): Promise<WhatsAppWebhookResult> {
  const from = message.from;
  if (isButtonReply(message)) {
    return await handleButtonReply(from, message, groupId, phoneNumberId, mode);
  }

  const media = extractMedia(message);
  if (media) {
    return await handleMedia(from, media, message, groupId, phoneNumberId, mode, orgId, claimedGroupId);
  }

  if (message.type === "text") {
    console.log(`[whatsapp] text from ${from}: ${(message.text?.body ?? "").slice(0, 120)}`);
    // In group chats, only talk back on plain text when the bot is @mentioned
    // (so we don't reply to every casual group message). Images/PDFs above are
    // always proofed regardless of mention.
    if (groupId && !wasMentioned(message, phoneNumberId)) {
      console.log(`[whatsapp] ignored group text ${message.id}: bot not mentioned`);
      return { handled: false, action: "ignored" };
    }

    // If the bot is @mentioned in an unclaimed group, prompt the user to
    // link the group via the dashboard auth-code flow. Send once per group.
    if (groupId && !claimedGroupId && !linkPromptSentGroups.has(groupId)) {
      linkPromptSentGroups.add(groupId);
      const prompt =
        "This group isn't linked to a workspace yet. An admin can link it from the dashboard: go to Team → WhatsApp Groups, create an auth code, then paste that code (e.g. WN-A7F3K2) right here in this group.";
      await (mode === "waha"
        ? sendTextWaha(from, prompt, message.id)
        : sendText(from, prompt, groupId, message.id, phoneNumberId)
      ).catch(() => {});
    }

    if (!introSentChats.has(from)) {
      introSentChats.add(from);
      if (introSentChats.size > 500) introSentChats.clear();
      await (mode === "waha" ? sendTextWaha(from, INTRO_LINES, message.id) : sendText(from, INTRO_LINES, groupId, message.id, phoneNumberId));
    } else {
      const reminder = "Send me an image or a PDF and I'll proof it right here 🐢";
      await (mode === "waha" ? sendTextWaha(from, reminder, message.id) : sendText(from, reminder, groupId, message.id, phoneNumberId));
    }
    return { handled: true, action: "text" };
  }

  return { handled: false, action: "ignored" };
}

/** Chats that already received the full intro (short reminder afterwards instead). */
const introSentChats = new Set<string>();
/** Groups that have already received the "link this group" prompt. */
const linkPromptSentGroups = new Set<string>();
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
  mode: "meta" | "waha" = "meta",
  orgId?: string,
  claimedGroupId?: string | null,
): Promise<WhatsAppWebhookResult> {
  const isWaha = mode === "waha";

  try {
    const bytes = isWaha
      ? await downloadMediaWaha(media.mediaId)
      : await downloadMedia(media.mediaId, phoneNumberId);
    const kind = media.mime === "application/pdf" ? "pdf" : "image";

    // Use the org resolved from the group claim (if any), falling back to
    // the sender-based resolution so 1:1 messages still work.
    const resolvedOrg = orgId ?? (await resolveOrgId(from, phoneNumberId));

    // If this message arrived in a group that was just claimed via auth code
    // in this same webhook batch, link the asset to that group.
    const linkedGroupId = claimedGroupId ?? groupId;

    const providedName = message?.image?.caption || message?.document?.filename;
    const count = (imageCounters.get(from) ?? 0) + 1;
    imageCounters.set(from, count);
    const name =
      providedName ||
      `WhatsApp upload${count > 1 ? ` #${count}` : ""}${groupId ? ` (group)` : ""}`;

    const created = await createAssetVersionFromBytes({
      orgId: resolvedOrg,
      name: name,
      mime: media.mime,
      kind,
      bytes,
      lookupGroupId: linkedGroupId ?? undefined,
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

    // Top corrections first (up to 3, then "+X more"), then the URL directly
    // below with no extra blank line:
    //   Typo: recieve → receive
    //   Grammar: He go → He goes
    //   +2 more
    //   https://bot.usama.fun/r/xyz
    const corrections = formatCorrectionList(result.report.issues);
    const status = reportStatus(result.report.issues);

    let detailBody: string;
    if (corrections) {
      detailBody = `${corrections}\n${reportUrl}`;
    } else {
      // No clean before→after pair extractable, or the asset is clean.
      detailBody = `${status.emoji} ${status.label}\n${reportUrl}`;
    }

    // Single reply: interactive card with summary + report link + approve/request
    // buttons. If WhatsApp filters the card (code 131026), the failed-status
    // fallback below re-sends the plain text so the user never loses the result.
    const msgId = isWaha
      ? await sendInteractiveWaha(from, detailBody, {
          reply: [
            { id: `approve:${created.assetId}:${created.version}`, title: "Approve" },
            { id: `changes:${created.assetId}:${created.version}`, title: "Request changes" },
          ],
          url: [{ url: reportUrl, title: "View Report" }],
        }, message.id)
      : await sendInteractive(
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
    const errMsg = err instanceof Error ? err.message : "something went wrong";
    console.error(`[whatsapp] media proof failed: ${errMsg}`);
    await (isWaha
      ? sendTextWaha(from, `Sorry, I couldn't proof that: ${errMsg}`, message.id)
      : sendText(from, `Sorry, I couldn't proof that: ${errMsg}`, groupId, undefined, phoneNumberId)
    ).catch(() => {});
    return { handled: true, action: "media" };
  }
}

async function handleButtonReply(
  from: string,
  message: any,
  groupId?: string,
  phoneNumberId?: string,
  mode: "meta" | "waha" = "meta",
): Promise<WhatsAppWebhookResult> {
  const isWaha = mode === "waha";
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
    const msgId = isWaha
      ? await sendInteractiveWaha(from, confirmation, { url: [{ url: reportUrl, title: "View Report" }] }, message.id)
      : await sendInteractive(
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
    await (isWaha
      ? sendTextWaha(from, `Sorry, I couldn't apply that: ${msg}`, message.id)
      : sendText(from, `Sorry, I couldn't apply that: ${msg}`, groupId, undefined, phoneNumberId)
    ).catch(() => {});
    return { handled: true, action: "button" };
  }
}

/** Resolve the org for an unauthenticated WhatsApp group: look up the claimed
 * groups table by external_id (= group JID). Returns null if the group hasn't
 * been claimed yet (auth code hasn't been used).
 */
async function resolveGroupOrg(
  admin: Awaited<ReturnType<typeof createAdminClient>>,
  groupJid: string,
): Promise<string | null> {
  try {
    const { data } = await admin
      .from("groups")
      .select("org_id")
      .eq("external_id", groupJid)
      .eq("platform", "whatsapp")
      .maybeSingle();
    return data?.org_id ?? null;
  } catch {
    return null;
  }
}

/** Dispatch a single message to the right handler: button reply, media proof, or casual text. */
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

/**
 * Try to claim a WhatsApp group using an auth code sent in a group text.
 *
 * The code must match a pending code belonging to the resolved orgId (the
 * sender's org — a group can only be claimed by members of the org that
 * generated the code). On success the code is marked used, a groups row is
 * created linking the group JID to the org, and a reply is sent.
 */
async function tryClaimGroupAuthCode(
  admin: Awaited<ReturnType<typeof createAdminClient>>,
  orgId: string | null,
  groupId: string,
  body: string,
  phoneNumberId?: string,
  mode?: "meta" | "waha",
): Promise<{ ok: boolean; error?: string; linkedGroupId?: string | null }> {
  if (!orgId) return { ok: false, error: "no org resolved" };

  // Only exact code matches (trimmed). Codes look like "WN-A7F3K2".
  const trimmed = body.trim();
  if (!/^WN-[A-Z0-9]{6}$/i.test(trimmed)) return { ok: false, error: "not a code" };

  // Find a pending code for this org that matches the body.
  const { data: codeRow } = await admin
    .from("whatsapp_group_auth_codes")
    .select("id, code, status, expires_at")
    .eq("org_id", orgId)
    .eq("code", trimmed)
    .eq("status", "pending")
    .maybeSingle();

  if (!codeRow) return { ok: false, error: "no matching pending code" };
  if (new Date(codeRow.expires_at) < new Date()) {
    // Expired — mark it expired and reject.
    await admin
      .from("whatsapp_group_auth_codes")
      .update({ status: "expired" })
      .eq("id", codeRow.id);
    return { ok: false, error: "code expired" };
  }

  // Fetch the real WhatsApp group subject first (Meta Graph API) so we have
  // the actual group name to store alongside the code record. For WAHA we fall
  // back to a JID-based name.
  let groupName = `WhatsApp group ${groupId.slice(0, 12)}…`;
  if (phoneNumberId) {
    try {
      const metaRes = await fetch(
        `https://graph.facebook.com/v18.0/${phoneNumberId}/groups/${encodeURIComponent(groupId)}`,
        { headers: { Authorization: `Bearer ${process.env.WHATSAPP_API_TOKEN ?? ""}` } },
      );
      if (metaRes.ok) {
        const g = (await metaRes.json()) as { name?: string };
        if (g.name) groupName = g.name;
      }
    } catch {
      // fall through to JID-based name
    }
  }

  // Mark the code used and record which group JID was claimed + the group name.
  const now = new Date().toISOString();
  const { error: codeErr } = await admin
    .from("whatsapp_group_auth_codes")
    .update({ status: "used", used_at: now, group_jid: groupId, group_name: groupName })
    .eq("id", codeRow.id);
  if (codeErr) return { ok: false, error: "failed to mark code used" };

  // Create / link the groups row keyed by the group JID (external_id).
  // onConflict on (org_id, external_id) ensures the same group can't be
  // claimed twice for the same org — the upsert returns the existing row.
  const { data: groupRes, error: groupErr } = await admin
    .from("groups")
    .insert({
      org_id: orgId,
      name: groupName,
      platform: "whatsapp",
      external_id: groupId,
    })
    .onConflict("(org_id, external_id)")
    .select("id")
    .single();
  const linkedGroupId = groupErr ? null : (groupRes?.id ?? null);

  console.log(`[whatsapp] claimed group ${groupId} for org ${orgId} via code ${codeRow.code}`);
  return { ok: true, linkedGroupId };
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
