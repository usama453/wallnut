import { createAdminClient } from "@/lib/supabase/server";
import { runProof } from "@/lib/proof/runProof";
import { proofSemaphore } from "@/lib/proof/concurrency";
import { createAssetVersionFromBytes } from "@/lib/assets";
import { logUsage } from "@/lib/whatsapp/usage";
import {
  type Activity,
  type ProofResultMeta,
  type ProofSummary,
  downloadAttachment,
  replyToActivity,
  buildReportCard,
  reportText,
  botMentioned,
  isPersonal,
} from "./activity";
import { wallnutChatReply } from "@/lib/ai/chat";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

/** Best-effort dedupe so Bot Framework retries don't double-process an activity. */
const seenActivities = new Map<string, number>();
const SEEN_TTL_MS = 10 * 60 * 1000;

export async function handleTeamsActivity(activity: Activity): Promise<void> {
  if (!activity.id || isSeen(activity.id)) return;
  markSeen(activity.id);

  const conversationId = activity.conversation?.id ?? activity.from?.id ?? "";
  const sender = activity.from?.id ?? "";

  console.log(
    `[teams] activity type=${activity.type} channel=${activity.channelId} conv=${conversationId} sender=${sender}${activity.text ? ` text="${(activity.text ?? "").slice(0, 80)}"` : ""}`,
  );

  // Approval button pressed on a report card.
  if (activity.type === "message" && activity.value?.action) {
    await handleApproval(activity, activity.value);
    return;
  }

  if (activity.type === "message") {
    const media = (activity.attachments ?? []).find(
      (a) => a.contentType?.startsWith("image/") || a.contentType === "application/pdf",
    );
    if (media) {
      await handleMedia(activity, media);
      return;
    }

    // Only talk back on text that mentions the bot (or a 1:1 chat) to avoid spam.
    const text = (activity.text ?? "").trim();
    if ((botMentioned(activity) || isPersonal(activity)) && text) {
      const reply = await chatReply(text.replace(/<at>.*?<\/at>/gi, "").trim());
      await replyToActivity(activity, { text: reply }).catch(() => {});
      logUsage({
        direction: "outbound",
        msg_type: "text",
        to_phone: conversationId,
      });
    }
  }
}

async function handleMedia(activity: Activity, attachment: any) {
  const conversationId = activity.conversation?.id ?? activity.from?.id ?? "";
  const sender = activity.from?.id ?? "";

  try {
    const { bytes, mime } = await downloadAttachment(attachment);
    const kind = mime === "application/pdf" ? "pdf" : "image";

    const orgId = process.env.WHATSAPP_DEFAULT_ORG_ID ?? null;
    const name = attachment.name || `Teams upload ${new Date().toISOString().slice(11, 19)}`;

    logUsage({
      direction: "inbound",
      msg_type: "image",
      from_phone: sender,
      group_id: conversationId,
    });

    const created = await createAssetVersionFromBytes({ orgId, name, mime, kind, bytes });

    const result = await proofSemaphore.run(() => runProof(created.versionId));
    console.log(`[teams] proof done for ${created.assetId} score=${result.report.score}`);

    logUsage({
      direction: "inbound",
      msg_type: "proof",
      from_phone: sender,
      group_id: conversationId,
      status: String(result.report.score),
      asset_id: created.assetId,
    });

    const reportUrl = `${APP_URL}/r/${created.slug}`;
    const meta: ProofResultMeta = {
      assetId: created.assetId,
      version: created.version,
      name,
    };
    const summary: ProofSummary = {
      score: result.report.score,
      status: result.report.status,
      summary: result.report.summary,
      issues: result.report.issues.map((i) => ({ severity: i.severity, title: i.title })),
    };

    try {
      await replyToActivity(activity, {
        text: reportText(summary, meta, reportUrl),
        attachments: [buildReportCard(summary, meta, reportUrl)],
      });
    } catch (err) {
      // Fall back to plain text if the card is rejected.
      console.error(`[teams] card reply failed, using text: ${err instanceof Error ? err.message : err}`);
      await replyToActivity(activity, { text: reportText(summary, meta, reportUrl) }).catch(() => {});
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "something went wrong";
    console.error(`[teams] media proof failed: ${message}`);
    await replyToActivity(activity, { text: `Sorry, I couldn't proof that: ${message}` }).catch(() => {});
  }
}

async function handleApproval(activity: Activity, value: any) {
  const { action, assetId, version } = value;
  const sender = activity.from?.id ?? "";

  if (!assetId) return;
  const status = action === "approve" ? "approved" : "changes_requested";

  try {
    const admin = await createAdminClient();
    const { data: asset } = await admin.from("assets").select("id, name, slug").eq("id", assetId).maybeSingle();
    if (!asset) throw new Error("asset not found");

    await admin.from("assets").update({ status }).eq("id", assetId);
    await admin.from("approvals").insert({
      asset_id: assetId,
      version: Number(version ?? 1),
      status,
      comment: `Approved via Teams (${sender})`,
    });

    const reportUrl = `${APP_URL}/r/${asset.slug ?? asset.id}`;
    const confirmation =
      status === "approved"
        ? `Got it — "${asset.name}" is approved ✅`
        : `Noted — changes requested for "${asset.name}" ⚠️`;

    await replyToActivity(activity, {
      text: confirmation,
      attachments: [
        {
          contentType: "application/vnd.microsoft.card.adaptive",
          content: {
            type: "AdaptiveCard",
            $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
            version: "1.4",
            body: [{ type: "TextBlock", text: confirmation, wrap: true }],
            actions: [{ type: "Action.OpenUrl", title: "View report", url: reportUrl }],
          },
        },
      ],
    });
    logUsage({
      direction: "inbound",
      msg_type: "approval",
      from_phone: sender,
      group_id: activity.conversation?.id,
      status,
      asset_id: assetId,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    await replyToActivity(activity, { text: `Sorry, I couldn't apply that: ${msg}` }).catch(() => {});
  }
}

/** Casual chat reply in the duck persona, with a reliable offline fallback. */
async function chatReply(message: string): Promise<string> {
  return wallnutChatReply(message);
}

function isSeen(id: string): boolean {
  const at = seenActivities.get(id);
  if (!at) return false;
  if (Date.now() - at > SEEN_TTL_MS) {
    seenActivities.delete(id);
    return false;
  }
  return true;
}

function markSeen(id: string) {
  seenActivities.set(id, Date.now());
  if (seenActivities.size > 500) {
    const now = Date.now();
    for (const [k, v] of seenActivities) {
      if (now - v > SEEN_TTL_MS) seenActivities.delete(k);
    }
  }
}
