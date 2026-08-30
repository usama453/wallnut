import { createAdminClient } from "@/lib/supabase/server";
import { runProof } from "@/lib/proof/runProof";
import { proofSemaphore } from "@/lib/proof/concurrency";
import { stripWhatsAppMentions, wallnutChatReply } from "@/lib/ai/chat";
import { proofPlainText } from "@/lib/proof/text-proof";
import {
  buildMentionChatInput,
  resolveTextToProof,
  wantsTextProof,
  type WhatsAppMentionContext,
} from "./mention-context";
import { createAssetVersionFromBytes } from "@/lib/assets";
import { downloadMediaWaha, fetchWahaGroup, sendInteractiveWaha, sendTextWaha } from "./client";
import { logUsage } from "./usage";
import { formatWhatsAppReply, whatsappReplyPreview } from "@/lib/reportSummary";
import { getProofResponseStyle } from "@/lib/proof/proof-settings-store";
import {
  extractMedia,
  extractWahaMessages,
  isButtonReply,
  getButtonReplyId,
} from "./webhook";
import { BOT_PHONE_NUMBER, WAHA_SESSION } from "./config";
import { loadAccessState, trackSeenChat } from "./access";
import { rememberWhatsAppContact, importWhatsAppGroupContacts, saveWhatsAppContacts, contactsFromGroupParticipant } from "./contacts";
import { clearDisconnectedWhatsAppGroup, isWhatsAppGroupDisconnected } from "./disconnected-groups";
import { directMessageGroupName, isWhatsAppDirectChat } from "@/lib/groups-presentation";
import { fallbackGroupName, getGroupName } from "./group-name";
import { pendingGroupExternalId } from "./placeholder-groups";
import { canonicalChatId, whatsappChatIdVariants } from "./jid";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

/** Best-effort dedupe of inbound message ids. */
const seenMessages = new Map<string, number>();
const SEEN_TTL_MS = 10 * 60 * 1000;

const imageCounters = new Map<string, number>();

export interface WhatsAppWebhookResult {
  handled: boolean;
  action: "media" | "button" | "text" | "ignored";
}

/** Entry point for a single WAHA WhatsApp message event. */
export async function handleWhatsAppMessageEvent(event: any): Promise<WhatsAppWebhookResult> {
  const phoneNumberId = BOT_PHONE_NUMBER || undefined;

  // Store the raw payload for the webhook viewer (best-effort).
  storeWebhookEvent(event, phoneNumberId).catch(() => {});

  const messages = extractWahaMessages(event, WAHA_SESSION);
  console.log(`[whatsapp] inbound event messageCount=${messages.length}`);

  let handled = false;
  let lastAction: WhatsAppWebhookResult["action"] = "ignored";
  const admin = await createAdminClient();
  for (const message of messages) {
    if (!message?.from) continue;
    if (isSeen(message.id)) {
      console.log(`[whatsapp] skipping already-processed message ${message.id}`);
      continue;
    }
    markSeen(message.id);
    const groupId = message?.context?.group_id ?? undefined;
    const sender = message.sender ?? message.from;

    // Auth codes are globally unique, so an unclaimed group can resolve its
    // organization from the code itself.
    if (groupId && message.type === "text") {
      const body = message.text?.body?.trim() ?? "";
      const claimed = await tryClaimGroupAuthCode(admin, groupId, body);
      if (claimed.ok) {
        console.log(
          `[whatsapp] group ${groupId} claimed for org=${claimed.orgId}`,
        );
        await sendTextWaha(
          message.from,
          `Connected “${claimed.groupName}” to Wallnut. Images and PDFs sent here can now be proofed.`,
          message.id,
        ).catch(() => {});
        await trackSeenChat(
          admin,
          claimed.orgId ?? null,
          canonicalChatId(message.from),
          message.text?.body,
        );
        handled = true;
        lastAction = "text";
        continue;
      }
    }

    // For group messages, resolve org from claimed groups first.
    let groupOrgId: string | null = null;
    if (groupId) {
      const linkedOrgId = await resolveGroupOrg(admin, groupId);
      if (linkedOrgId) {
        groupOrgId = linkedOrgId;
      } else if (await isWhatsAppGroupDisconnected(groupId)) {
        console.log(`[whatsapp] ignored group ${groupId}: disconnected from workspace`);
        logUsage({
          direction: "inbound",
          msg_type: message.type,
          message_id: message.id,
          from_phone: sender,
          group_id: groupId,
          status: "disconnected",
        });
        handled = true;
        lastAction = "ignored";
        continue;
      } else {
        groupOrgId = await getPublicOrgId(admin);
      }
    }

    const orgId =
      groupOrgId ?? (await resolveOrgId(sender, admin));
    rememberWhatsAppContact({
      orgId,
      phone: sender,
      displayName: message.pushName,
    });
    const accessChatId = canonicalChatId(message.from);
    void trackSeenChat(admin, orgId, accessChatId, message.text?.body).catch(() => {});
    const cached =
      accessCache?.org === orgId && Date.now() - accessCache.at < ACCESS_TTL_MS;
    const state = cached && accessCache ? accessCache.state : await loadAccessState(admin, orgId);
    if (!cached) accessCache = { org: orgId, state, at: Date.now() };
    if (
      state.mode === "allowlist" &&
      !state.allowed.has(message.from) &&
      !state.allowed.has(accessChatId)
    ) {
      console.log(`[whatsapp] ignored msg ${message.id}: chat not in allowlist`);
      logUsage({
        direction: "inbound",
        msg_type: message.type,
        message_id: message.id,
        from_phone: sender,
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
      from_phone: sender,
      group_id: groupId,
    });

    const result = await dispatchMessage(message, groupId, orgId);
    handled = handled || result.handled;
    lastAction = result.action;
  }
  return { handled, action: lastAction };
}

/** Short-lived cache of the access gate. */
let accessCache: {
  org: string | null;
  state: Awaited<ReturnType<typeof loadAccessState>>;
  at: number;
} | null = null;
const ACCESS_TTL_MS = 30 * 1000;

/** True when a group message @mentions the bot (phone JID or @wallnut). */
function wasMentioned(message: any): boolean {
  const body: string = message?.text?.body ?? "";
  if (/@wallnut\b/i.test(body)) return true;
  const tokens = body.match(/@([0-9]{6,})/g) ?? [];
  const mentions = Array.isArray(message?.mentions) ? message.mentions : [];
  const bot = jidDigits(BOT_PHONE_NUMBER || message?.botId || "");
  if (!bot || bot.length < 6) return false;
  return [...tokens, ...mentions].some((mention) => {
    const digits = jidDigits(String(mention));
    return digits.includes(bot.slice(-10)) || bot.includes(digits.slice(-10));
  });
}

function jidDigits(value: string) {
  return value.split("@")[0].split(":")[0].replace(/\D/g, "");
}

async function dispatchMessage(
  message: any,
  groupId: string | undefined,
  orgId?: string | null,
): Promise<WhatsAppWebhookResult> {
  const from = message.from;
  if (isButtonReply(message)) {
    return handleButtonReply(from, message, groupId);
  }

  const media = extractMedia(message);
  if (media) {
    return handleMedia(from, media, message, groupId, orgId);
  }

  if (message.type === "text") {
    const body = message.text?.body ?? "";
    console.log(`[whatsapp] text from ${from}: ${body.slice(0, 120)}`);
    if (groupId && !wasMentioned(message)) {
      console.log(`[whatsapp] ignored group text ${message.id}: bot not mentioned`);
      return { handled: false, action: "ignored" };
    }

    const mentionCtx: WhatsAppMentionContext = {
      userMessage: stripWhatsAppMentions(body),
      quotedMessage: message.quoted?.body,
      quotedHasMedia: message.quoted?.hasMedia,
    };

    if (wantsTextProof(mentionCtx.userMessage) || wantsTextProof(body)) {
      if (mentionCtx.quotedHasMedia && !mentionCtx.quotedMessage?.trim()) {
        await sendTextWaha(
          from,
          "I can see you're replying to a file — @mention me on the image or PDF directly and I'll proof it.",
          message.id,
        );
        return { handled: true, action: "text" };
      }

      const textToProof = resolveTextToProof(mentionCtx);
      if (textToProof) {
        const report = await proofPlainText(textToProof, orgId);
        const responseStyle = await getProofResponseStyle();
        const reply = formatWhatsAppReply(report.issues, responseStyle, {
          humanReply: report.humanReply,
          summary: report.summary,
        });
        await sendTextWaha(from, reply, message.id);
        logUsage({
          direction: "outbound",
          msg_type: "text",
          to_phone: from,
          group_id: groupId,
          status: "text-proof",
        });
        return { handled: true, action: "text" };
      }
    }

    const reply = await wallnutChatReply(buildMentionChatInput(mentionCtx, groupId));
    await sendTextWaha(from, reply, message.id);
    logUsage({
      direction: "outbound",
      msg_type: "text",
      to_phone: from,
      group_id: groupId,
      status: "chat",
    });
    return { handled: true, action: "text" };
  }

  return { handled: false, action: "ignored" };
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
  media: { reference: string; mime: string; filename?: string | null },
  message: any,
  groupId?: string,
  orgId?: string | null,
): Promise<WhatsAppWebhookResult> {
  try {
    const bytes = await downloadMediaWaha(media.reference);
    const kind = media.mime === "application/pdf" ? "pdf" : "image";
    const sender = message.sender ?? from;
    const admin = await createAdminClient();
    const resolvedOrg = orgId ?? (await resolveOrgId(sender, admin));
    if (!resolvedOrg) {
      throw new Error("this chat is not linked to a Wallnut workspace");
    }

    const chatId = groupId ?? canonicalChatId(from);
    const groupRowId = await ensureWhatsAppGroup(
      admin,
      resolvedOrg,
      chatId,
      groupId
        ? await getGroupName(groupId)
        : directMessageGroupName(from, message.pushName),
    );

    const providedName =
      message?.image?.caption ||
      message?.document?.filename ||
      message?.document?.caption ||
      media.filename;
    const count = (imageCounters.get(from) ?? 0) + 1;
    imageCounters.set(from, count);
    const name =
      providedName ||
      `WhatsApp upload${count > 1 ? ` #${count}` : ""}${groupId ? ` (group)` : ""}`;

    const created = await createAssetVersionFromBytes({
      orgId: resolvedOrg,
      name,
      mime: media.mime,
      kind,
      bytes,
      lookupGroupId: chatId,
      groupId: groupRowId,
    });

    const result = await proofSemaphore.run(() => runProof(created.versionId));
    console.log(`[whatsapp] proof done for ${created.assetId} score=${result.report.score}`);

    const responseStyle = await getProofResponseStyle();
    const replyTitle = whatsappReplyPreview(result.report.issues, responseStyle, {
      humanReply: result.report.humanReply,
      summary: result.report.summary,
    });
    await admin.from("assets").update({ name: replyTitle }).eq("id", created.assetId);

    logUsage({
      direction: "inbound",
      msg_type: "proof",
      from_phone: sender,
      group_id: groupId,
      status: String(result.report.score),
      asset_id: created.assetId,
    });

    const reportUrl = `${APP_URL}/r/${created.slug}`;

    const replyBody = formatWhatsAppReply(result.report.issues, responseStyle, {
      humanReply: result.report.humanReply,
      summary: result.report.summary,
    });

    await sendInteractiveWaha(from, replyBody, {
      reply: [
        { id: `approve:${created.assetId}:${created.version}`, title: "Approve" },
        { id: `changes:${created.assetId}:${created.version}`, title: "Request changes" },
      ],
      url: [{ url: reportUrl, title: "View Report" }],
    }, message.id);

    return { handled: true, action: "media" };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "something went wrong";
    console.error(`[whatsapp] media proof failed: ${errMsg}`);
    await sendTextWaha(from, `Sorry, I couldn't proof that: ${errMsg}`, message.id).catch(() => {});
    return { handled: true, action: "media" };
  }
}

async function handleButtonReply(
  from: string,
  message: any,
  groupId?: string,
): Promise<WhatsAppWebhookResult> {
  const replyId = getButtonReplyId(message) ?? "";
  if (!replyId.startsWith("approve:") && !replyId.startsWith("changes:")) {
    return { handled: false, action: "ignored" };
  }
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

    const { error: updateError } = await admin
      .from("assets")
      .update({ status })
      .eq("id", assetId);
    if (updateError) throw updateError;

    const { error: approvalError } = await admin.from("approvals").insert({
      asset_id: assetId,
      version,
      status,
      comment: `Approved via WhatsApp (${from})`,
    });
    if (approvalError) throw approvalError;

    const reportUrl = `${APP_URL}/r/${asset.slug ?? asset.id}`;
    const confirmation =
      status === "approved"
        ? `Got it — "${asset.name}" is approved ✅`
        : `Noted — changes requested for "${asset.name}" ⚠️`;
    await sendInteractiveWaha(
      from,
      confirmation,
      { url: [{ url: reportUrl, title: "View Report" }] },
      message.id,
    );
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
    await sendTextWaha(from, `Sorry, I couldn't apply that: ${msg}`, message.id).catch(() => {});
    return { handled: true, action: "button" };
  }
}

/** Resolve org for a claimed WhatsApp group by JID. */
async function resolveGroupOrg(
  admin: Awaited<ReturnType<typeof createAdminClient>>,
  groupJid: string,
): Promise<string | null> {
  try {
    const { data } = await admin
      .from("groups")
      .select("org_id")
      .in("external_id", whatsappChatIdVariants(groupJid))
      .eq("platform", "whatsapp")
      .limit(1)
      .maybeSingle();
    return data?.org_id ?? null;
  } catch {
    return null;
  }
}

/** Direct chats and unclaimed groups land in Public. */
async function resolveOrgId(
  _phone: string,
  admin: Awaited<ReturnType<typeof createAdminClient>>,
): Promise<string | null> {
  const fromEnv = process.env.WHATSAPP_DEFAULT_ORG_ID;
  if (fromEnv) return fromEnv;
  return getPublicOrgId(admin);
}

let publicOrgCache: { id: string; at: number } | null = null;

async function getPublicOrgId(
  admin: Awaited<ReturnType<typeof createAdminClient>>,
): Promise<string | null> {
  if (publicOrgCache && Date.now() - publicOrgCache.at < 60_000) {
    return publicOrgCache.id;
  }
  const { data } = await admin
    .from("organizations")
    .select("id")
    .in("slug", ["public", "default"])
    .limit(1)
    .maybeSingle();
  if (data?.id) publicOrgCache = { id: data.id, at: Date.now() };
  return data?.id ?? null;
}

async function ensureWhatsAppGroup(
  admin: Awaited<ReturnType<typeof createAdminClient>>,
  orgId: string,
  chatId: string,
  name: string,
): Promise<string | null> {
  const variants = whatsappChatIdVariants(chatId);
  const { data: existing } = await admin
    .from("groups")
    .select("id, org_id")
    .in("external_id", variants)
    .eq("platform", "whatsapp")
    .limit(1)
    .maybeSingle();
  if (existing?.id) return existing.id;

  const externalId = chatId.includes("@") ? chatId : canonicalChatId(chatId);
  const rawLabel = name.trim().slice(0, 120) || externalId;
  const label = isWhatsAppDirectChat(externalId)
    ? directMessageGroupName(chatId, rawLabel)
    : rawLabel;
  const { data: created } = await admin
    .from("groups")
    .insert({
      org_id: orgId,
      name: label,
      platform: "whatsapp",
      external_id: externalId,
    })
    .select("id")
    .maybeSingle();
  if (created?.id) return created.id;

  const { data: raced } = await admin
    .from("groups")
    .select("id")
    .in("external_id", variants)
    .eq("platform", "whatsapp")
    .limit(1)
    .maybeSingle();
  return raced?.id ?? null;
}

function phoneLabel(raw: string) {
  const digits = raw.split("@")[0].replace(/\D/g, "");
  return digits ? `+${digits}` : raw;
}

/** Try to claim a WhatsApp group using an auth code sent in a group text. */
async function tryClaimGroupAuthCode(
  admin: Awaited<ReturnType<typeof createAdminClient>>,
  groupId: string,
  body: string,
): Promise<{
  ok: boolean;
  error?: string;
  orgId?: string;
  groupName?: string;
}> {
  const trimmed = body.trim();
  if (!/^WN-[A-Z0-9]{6}$/i.test(trimmed)) return { ok: false, error: "not a code" };

  const { data: codeRow } = await admin
    .from("whatsapp_group_auth_codes")
    .select("id, org_id, code, status, expires_at")
    .eq("code", trimmed.toUpperCase())
    .eq("status", "pending")
    .maybeSingle();

  if (!codeRow) return { ok: false, error: "no matching pending code" };
  if (new Date(codeRow.expires_at) < new Date()) {
    await admin
      .from("whatsapp_group_auth_codes")
      .update({ status: "expired" })
      .eq("id", codeRow.id);
    return { ok: false, error: "code expired" };
  }

  const groupMeta = await fetchWahaGroup(groupId);
  const groupName = groupMeta?.subject?.trim() || fallbackGroupName(groupId);
  const pendingKey = pendingGroupExternalId(codeRow.code);

  const [{ data: existingGroup }, { data: placeholder }] = await Promise.all([
    admin
      .from("groups")
      .select("id, org_id")
      .in("external_id", whatsappChatIdVariants(groupId))
      .eq("platform", "whatsapp")
      .limit(1)
      .maybeSingle(),
    admin
      .from("groups")
      .select("id")
      .eq("org_id", codeRow.org_id)
      .eq("platform", "whatsapp")
      .eq("external_id", pendingKey)
      .maybeSingle(),
  ]);
  if (existingGroup && existingGroup.org_id !== codeRow.org_id) {
    const publicOrgId = await getPublicOrgId(admin);
    if (existingGroup.org_id === publicOrgId) {
      await admin
        .from("groups")
        .update({ org_id: codeRow.org_id, name: groupName })
        .eq("id", existingGroup.id);
      await admin
        .from("assets")
        .update({ org_id: codeRow.org_id })
        .eq("group_id", existingGroup.id);
    } else {
      return { ok: false, error: "group is already linked to another organization" };
    }
  }

  if (!existingGroup) {
    if (placeholder) {
      const { error: placeholderError } = await admin
        .from("groups")
        .update({ external_id: groupId, name: groupName })
        .eq("id", placeholder.id);
      if (placeholderError) {
        return { ok: false, error: "failed to link group" };
      }
    } else {
      let groupResult = await admin
        .from("groups")
        .upsert({
          org_id: codeRow.org_id,
          name: groupName,
          platform: "whatsapp",
          external_id: groupId,
        }, { onConflict: "org_id,external_id" })
        .select("id")
        .single();
      if (groupResult.error?.code === "23505") {
        groupResult = await admin
          .from("groups")
          .upsert({
            org_id: codeRow.org_id,
            name: `${groupName} (${groupId.slice(0, 6)})`,
            platform: "whatsapp",
            external_id: groupId,
          }, { onConflict: "org_id,external_id" })
          .select("id")
          .single();
      }
      if (groupResult.error) {
        return { ok: false, error: "failed to link group" };
      }
    }
  } else if (placeholder && placeholder.id !== existingGroup.id) {
    await admin.from("groups").delete().eq("id", placeholder.id);
  }

  const now = new Date().toISOString();
  const { error: codeErr } = await admin
    .from("whatsapp_group_auth_codes")
    .update({ status: "used", used_at: now, group_jid: groupId, group_name: groupName })
    .eq("id", codeRow.id)
    .eq("status", "pending");
  if (codeErr) return { ok: false, error: "failed to mark code used" };

  console.log(
    `[whatsapp] claimed group ${groupId} for org ${codeRow.org_id} via code ${codeRow.code}`,
  );
  await clearDisconnectedWhatsAppGroup(groupId);
  void (async () => {
    try {
      const saved = await saveWhatsAppContacts(
        codeRow.org_id,
        (groupMeta?.participants ?? []).flatMap((participant) =>
          contactsFromGroupParticipant(participant),
        ),
      );
      if (saved === 0) {
        await importWhatsAppGroupContacts(codeRow.org_id, groupId);
      }
    } catch (error) {
      console.error(
        `[whatsapp] contact import failed for ${groupId}: ${error instanceof Error ? error.message : error}`,
      );
    }
  })();
  return { ok: true, orgId: codeRow.org_id, groupName };
}

/** Best-effort persistence of raw webhook payloads. */
async function storeWebhookEvent(value: any, phoneNumberId?: string) {
  try {
    const admin = await createAdminClient();
    await admin.from("webhook_events").insert({
      direction: "inbound",
      phone_number_id: phoneNumberId ?? null,
      payload: value ?? {},
    });
  } catch (err) {
    console.error(`[whatsapp] webhook store failed: ${err instanceof Error ? err.message : err}`);
  }
}
