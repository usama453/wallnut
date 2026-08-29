import { WAHA_API_KEY, WAHA_BASE_URL, WAHA_SESSION } from "./config";

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "X-Api-Key": WAHA_API_KEY,
};

/**
 * Download media referenced by a WAHA webhook. WAHA sends a media URL, not a
 * Meta-style media id. Rebuild the URL against the configured WAHA origin so a
 * forged webhook cannot make the server fetch an arbitrary host.
 */
export async function downloadMediaWaha(reference: string): Promise<Buffer> {
  assertConfigured();
  const base = new URL(WAHA_BASE_URL);
  let target: URL;

  if (/^https?:\/\//i.test(reference)) {
    const supplied = new URL(reference);
    target = new URL(`${supplied.pathname}${supplied.search}`, base);
  } else if (reference.startsWith("/")) {
    target = new URL(reference, base);
  } else {
    // Compatibility with early WAHA adapters that stored only an id.
    target = new URL(`/api/media/${encodeURIComponent(reference)}`, base);
  }

  const response = await fetch(target, {
    headers: { "X-Api-Key": WAHA_API_KEY },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`WAHA media download failed (${response.status})`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const data = (await response.json()) as { url?: string };
    if (!data.url || data.url === reference) {
      throw new Error("WAHA media response did not include a downloadable URL");
    }
    return downloadMediaWaha(data.url);
  }

  return Buffer.from(await response.arrayBuffer());
}

/** Send a plain text message via WAHA. */
export async function sendTextWaha(
  chatId: string,
  text: string,
  replyToMessageId?: string,
): Promise<string> {
  const response = await wahaFetch("/api/sendText", {
    method: "POST",
    body: JSON.stringify({
      session: WAHA_SESSION,
      chatId,
      text,
      ...(replyToMessageId ? { reply_to: replyToMessageId } : {}),
    }),
  });

  if (!response.ok) {
    throw new Error(
      `WAHA sendText failed (${response.status}): ${(await response.text()).slice(0, 300)}`,
    );
  }

  const id = messageId(await response.json().catch(() => ({})));
  console.log(`[waha-send] text ok to=${chatId} msgId=${id || "unknown"}`);
  return id;
}

/**
 * Send WAHA interactive buttons. Button support varies by engine, so an API
 * rejection automatically falls back to plain text plus the report URL.
 */
export async function sendInteractiveWaha(
  chatId: string,
  bodyText: string,
  buttons: {
    reply?: Array<{ id: string; title: string }>;
    url?: Array<{ url: string; title: string }>;
  },
  replyToMessageId?: string,
): Promise<string> {
  const payload = {
    session: WAHA_SESSION,
    chatId,
    body: bodyText.slice(0, 1024),
    ...(replyToMessageId ? { reply_to: replyToMessageId } : {}),
    buttons: [
      ...(buttons.reply?.map((button) => ({
        type: "reply",
        id: button.id,
        text: button.title,
      })) ?? []),
      ...(buttons.url?.map((button) => ({
        type: "url",
        text: button.title,
        url: button.url,
      })) ?? []),
    ],
  };

  const response = await wahaFetch("/api/sendButtons", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    console.warn(
      `[waha-send] sendButtons unavailable (${response.status}); using text fallback: ${detail}`,
    );
    const links = (buttons.url ?? [])
      .filter((button) => !bodyText.includes(button.url))
      .map((button) => `${button.title}: ${button.url}`)
      .join("\n");
    return sendTextWaha(
      chatId,
      links ? `${bodyText}\n${links}` : bodyText,
      replyToMessageId,
    );
  }

  const id = messageId(await response.json().catch(() => ({})));
  console.log(`[waha-send] buttons ok to=${chatId} msgId=${id || "unknown"}`);
  return id;
}

async function wahaFetch(path: string, init: RequestInit) {
  assertConfigured();
  return fetch(new URL(path, normalizedBaseUrl()), {
    ...init,
    headers: {
      ...JSON_HEADERS,
      ...init.headers,
    },
    cache: "no-store",
  });
}

function normalizedBaseUrl() {
  return WAHA_BASE_URL.endsWith("/") ? WAHA_BASE_URL : `${WAHA_BASE_URL}/`;
}

function assertConfigured() {
  if (!WAHA_API_KEY) {
    throw new Error("WAHA_API_KEY is not configured");
  }
}

function messageId(data: {
  id?: string | { _serialized?: string; id?: string };
}) {
  if (typeof data.id === "string") return data.id;
  return data.id?._serialized ?? data.id?.id ?? "";
}
