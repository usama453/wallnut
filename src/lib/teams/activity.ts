import { getBotAccessToken } from "./auth";
import { summarizeIssues, reportStatus } from "@/lib/reportSummary";

export interface Activity {
  id?: string;
  type: string;
  channelId?: string;
  serviceUrl?: string;
  conversation?: { id?: string; conversationType?: string };
  from?: { id?: string; name?: string };
  recipient?: { id?: string };
  text?: string;
  value?: any;
  attachments?: { id?: string; contentType?: string; contentUrl?: string; name?: string }[];
  mentions?: { mentioned?: { id?: string } }[];
  replyToId?: string;
}

export interface ProofSummary {
  score: number;
  status: "passed" | "needs_review" | "errors";
  summary: string | null;
  issues: { severity: string; title: string }[];
}

export interface ProofResultMeta {
  assetId: string;
  version: number;
  name: string;
}

function trustedServiceUrl(serviceUrl?: string): string {
  if (!serviceUrl) throw new Error("missing serviceUrl");
  try {
    const host = new URL(serviceUrl).hostname;
    if (
      host.endsWith("botframework.com") ||
      host.endsWith("trafficmanager.net") ||
      host.endsWith("skype.com")
    ) {
      return serviceUrl.replace(/\/+$/, "");
    }
  } catch {
    /* fall through */
  }
  throw new Error(`untrusted serviceUrl: ${serviceUrl}`);
}

/** Download a Teams attachment (image/document) as raw bytes. */
export async function downloadAttachment(attachment: { contentType?: string; contentUrl?: string }) {
  if (!attachment.contentUrl) throw new Error("attachment has no contentUrl");
  const token = await getBotAccessToken();
  const res = await fetch(attachment.contentUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`failed to download attachment (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  const mime = attachment.contentType ?? guessMime(attachment.contentUrl);
  return { bytes: buf, mime };
}

/** Reply to a specific activity within the same conversation. */
export async function replyToActivity(activity: Activity, payload: Record<string, unknown>) {
  const base = trustedServiceUrl(activity.serviceUrl);
  const conversationId = activity.conversation?.id;
  const replyToId = activity.id;
  if (!conversationId || !replyToId) throw new Error("missing conversation id / activity id");

  const token = await getBotAccessToken();
  const url = `${base}/v3/conversations/${encodeURIComponent(conversationId)}/activities/${encodeURIComponent(replyToId)}`;
  const body = {
    type: "message",
    text: (payload.text as string | undefined) ?? "",
    attachments: payload.attachments ?? [],
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`reply failed (${res.status}): ${text.slice(0, 300)}`);
  }
}

function guessMime(url: string): string {
  const u = url.toLowerCase();
  if (u.includes(".pdf")) return "application/pdf";
  if (u.includes(".png")) return "image/png";
  if (u.includes(".gif")) return "image/gif";
  if (u.includes(".webp")) return "image/webp";
  return "image/jpeg";
}

/** Adaptive Card summarizing a proof, with a link to the annotated report. */
export function buildReportCard(report: ProofSummary, meta: ProofResultMeta, reportUrl: string) {
  const color =
    report.score >= 90 ? "good" : report.score >= 70 ? "warning" : "attention";
  const statusLabel =
    report.status === "passed"
      ? "Passed"
      : report.status === "errors"
        ? "Needs changes"
        : "Needs review";

  const issueRows = report.issues.slice(0, 6).map((issue, i) => ({
    type: "TextBlock",
    text: `${i + 1}. ${issue.severity === "high" ? "🔴" : issue.severity === "medium" ? "🟠" : "🟡"} ${issue.title}`,
    wrap: true,
  }));

  return {
    contentType: "application/vnd.microsoft.card.adaptive",
    content: {
      $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
      type: "AdaptiveCard",
      version: "1.4",
      body: [
        { type: "TextBlock", text: `AI Proof: ${meta.name}`, weight: "Bolder", size: "Medium", wrap: true },
        { type: "TextBlock", text: `Score: ${report.score}/100 — ${statusLabel}`, size: "Large", weight: "Bolder", color },
        ...(report.summary ? [{ type: "TextBlock", text: report.summary, wrap: true }] : []),
        ...(report.issues.length
          ? [
              {
                type: "TextBlock",
                text: `Issues (${report.issues.length})`,
                weight: "Bolder",
                wrap: true,
              },
              ...issueRows,
              ...(report.issues.length > 6
                ? [{ type: "TextBlock", text: `+ ${report.issues.length - 6} more in the full report`, isSubtle: true }]
                : []),
            ]
          : [{ type: "TextBlock", text: "No issues found. 🎉", wrap: true }]),
      ],
      actions: [
        { type: "Action.OpenUrl", title: "View report", url: reportUrl },
        {
          type: "Action.Submit",
          title: "Approve ✅",
          data: { action: "approve", assetId: meta.assetId, version: meta.version },
        },
        {
          type: "Action.Submit",
          title: "Request changes ⚠️",
          data: { action: "changes", assetId: meta.assetId, version: meta.version },
        },
      ],
    },
  };
}

/** Plain-text fallback so a report is never lost (mirrors the WhatsApp behavior). */
export function reportText(report: ProofSummary, meta: ProofResultMeta, reportUrl: string): string {
  const statusLabel =
    report.status === "passed"
      ? "Passed ✅"
      : report.status === "errors"
        ? "Needs changes ❌"
        : "Needs review ⚠️";
  const summaryLine = summarizeIssues(report.issues);
  const status = reportStatus(report.issues);
  return (
    `${status.emoji} ${status.label}` +
    `\nAI Proof — "${meta.name}" scored ${report.score}/100 (${statusLabel})` +
    (report.summary ? `\n${report.summary}` : "") +
    (summaryLine ? `\n\n${summaryLine}` : "") +
    `\n\nOpen report: ${reportUrl}`
  );
}

export function botMentioned(activity: Activity): boolean {
  if (!activity.mentions?.length) return false;
  const botId = process.env.TEAMS_BOT_ID;
  return activity.mentions.some(
    (m) => m.mentioned?.id && (!botId || m.mentioned.id === botId),
  );
}

export function isPersonal(activity: Activity): boolean {
  return activity.conversation?.conversationType === "personal";
}
