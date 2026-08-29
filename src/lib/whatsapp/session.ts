import "server-only";

import { resolveConnection, type WahaConnection } from "./connection";
import { WAHA_WEBHOOK_HMAC_KEY } from "./config";

export interface WahaSessionState {
  configured: boolean;
  reachable: boolean;
  endpoint?: string;
  session: string;
  status: string;
  me?: {
    id?: string;
    pushName?: string;
  } | null;
  qrDataUrl?: string;
  webhookUrl?: string;
  webhookConfigured: boolean;
  error?: string;
}

interface WahaSessionResponse {
  name?: string;
  status?: string;
  me?: {
    id?: string;
    pushName?: string;
  } | null;
  config?: {
    webhooks?: Array<{ url?: string }>;
    [key: string]: unknown;
  };
}

export async function getWahaSessionState(
  includeQr = false,
): Promise<WahaSessionState> {
  const connection = await resolveConnection();
  if (!connection) {
    return {
      configured: false,
      reachable: false,
      session: process.env.WAHA_SESSION ?? "default",
      status: "NOT_CONFIGURED",
      webhookConfigured: false,
      error: "Set WAHA_BASE_URL and WAHA_API_KEY to connect WhatsApp.",
    };
  }

  const webhookUrl = configuredWebhookUrl();
  try {
    const response = await request(connection, `/api/sessions/${encodeURIComponent(connection.session)}`);
    if (response.status === 404) {
      return {
        configured: true,
        reachable: true,
        endpoint: connection.baseUrl,
        session: connection.session,
        status: "NOT_CREATED",
        webhookUrl,
        webhookConfigured: false,
      };
    }
    if (!response.ok) {
      return {
        configured: true,
        reachable: true,
        endpoint: connection.baseUrl,
        session: connection.session,
        status: "ERROR",
        webhookUrl,
        webhookConfigured: false,
        error: await responseError(response),
      };
    }

    const data = (await response.json()) as WahaSessionResponse;
    const status = data.status ?? "UNKNOWN";
    const state: WahaSessionState = {
      configured: true,
      reachable: true,
      endpoint: connection.baseUrl,
      session: connection.session,
      status,
      me: data.me ?? null,
      webhookUrl,
      webhookConfigured: Boolean(
        data.config?.webhooks?.some((webhook) =>
          isWallnutWebhook(webhook.url, webhookUrl),
        ),
      ),
    };

    if (includeQr) {
      const qr = await request(
        connection,
        `/api/${encodeURIComponent(connection.session)}/auth/qr`,
        { headers: { Accept: "image/png" } },
      );
      if (qr.ok) {
        const contentType = qr.headers.get("content-type") || "image/png";
        const bytes = Buffer.from(await qr.arrayBuffer());
        state.qrDataUrl = `data:${contentType};base64,${bytes.toString("base64")}`;
        if (status === "STARTING" || status === "STOPPED") {
          state.status = "SCAN_QR_CODE";
        }
      } else if (status === "SCAN_QR_CODE") {
        state.error = `Could not load QR code: ${await responseError(qr)}`;
      }
    }

    return state;
  } catch (error) {
    return {
      configured: true,
      reachable: false,
      endpoint: connection.baseUrl,
      session: connection.session,
      status: "UNREACHABLE",
      webhookUrl,
      webhookConfigured: false,
      error: `WAHA is not reachable at ${connection.baseUrl}: ${errorMessage(error)}`,
    };
  }
}

export async function runWahaSessionAction(
  action: "create" | "start" | "restart" | "logout" | "configure-webhook",
): Promise<void> {
  const connection = await resolveConnection();
  if (!connection) throw new Error("WAHA is not configured");

  if (action === "create") {
    const config = webhookConfig();
    await expectOk(
      request(connection, "/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: connection.session,
          start: true,
          ...(config ? { config } : {}),
        }),
      }),
      "create WAHA session",
    );
    return;
  }

  if (action === "configure-webhook") {
    const config = webhookConfig();
    if (!config) {
      throw new Error(
        "Set WAHA_WEBHOOK_URL or a public NEXT_PUBLIC_APP_URL before configuring the webhook",
      );
    }
    const currentResponse = await request(
      connection,
      `/api/sessions/${encodeURIComponent(connection.session)}`,
    );
    if (!currentResponse.ok) {
      throw new Error(await responseError(currentResponse));
    }
    const current = (await currentResponse.json()) as WahaSessionResponse;
    await expectOk(
      request(connection, `/api/sessions/${encodeURIComponent(connection.session)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: connection.session,
          config: {
            ...(current.config ?? {}),
            ...config,
          },
        }),
      }),
      "configure WAHA webhook",
    );
    return;
  }

  await expectOk(
    request(
      connection,
      `/api/sessions/${encodeURIComponent(connection.session)}/${action}`,
      { method: "POST" },
    ),
    `${action} WAHA session`,
  );
}

async function request(
  connection: WahaConnection,
  path: string,
  init: RequestInit = {},
) {
  return fetch(new URL(path, `${connection.baseUrl}/`), {
    ...init,
    headers: {
      "X-Api-Key": connection.apiKey,
      Accept: "application/json",
      ...init.headers,
    },
    cache: "no-store",
  });
}

async function expectOk(responsePromise: Promise<Response>, action: string) {
  let response: Response;
  try {
    response = await responsePromise;
  } catch (error) {
    throw new Error(`Could not ${action}: ${errorMessage(error)}`);
  }
  if (!response.ok) {
    throw new Error(`Could not ${action}: ${await responseError(response)}`);
  }
}

async function responseError(response: Response) {
  const detail = (await response.text()).slice(0, 300);
  return `WAHA returned ${response.status}${detail ? ` — ${detail}` : ""}`;
}

function webhookConfig() {
  const url = configuredWebhookUrl();
  if (!url) return null;
  return {
    webhooks: [
      {
        url,
        events: ["message"],
        ...(WAHA_WEBHOOK_HMAC_KEY
          ? { hmac: { key: WAHA_WEBHOOK_HMAC_KEY } }
          : {}),
        ...(!WAHA_WEBHOOK_HMAC_KEY
          ? {
              customHeaders: [
                {
                  name: "X-Api-Key",
                  value: process.env.WAHA_API_KEY ?? "",
                },
              ],
            }
          : {}),
        retries: {
          policy: "exponential",
          delaySeconds: 2,
          attempts: 4,
        },
      },
    ],
  };
}

function configuredWebhookUrl() {
  const explicit = process.env.WAHA_WEBHOOK_URL;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const candidate = explicit || (appUrl ? `${appUrl.replace(/\/$/, "")}/api/whatsapp/webhook` : "");
  if (!candidate) return undefined;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    if (!explicit && ["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
      return undefined;
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

function isWallnutWebhook(actual?: string, expected?: string) {
  if (!actual || !expected) return false;
  if (actual === expected) return true;
  try {
    const actualUrl = new URL(actual);
    return (
      actualUrl.pathname === "/api/whatsapp/webhook" &&
      actualUrl.hostname === "app"
    );
  } catch {
    return false;
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "unknown error";
}
