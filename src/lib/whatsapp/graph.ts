import { GRAPH_BASE, FB_APP_ID, FB_APP_SECRET, REDIRECT_URI } from "./config";

/** GET against the Graph API with an optional Bearer token. */
export async function graphGet(path: string, accessToken?: string): Promise<any> {
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) {
    throw new Error(`Graph GET ${path} failed: ${JSON.stringify(data?.error ?? data).slice(0, 300)}`);
  }
  return data;
}

/** POST against the Graph API with an optional Bearer token. Returns the raw
 * body (may contain an error) — callers decide, matching Meta's sample. */
export async function graphPost(path: string, accessToken?: string, body?: Record<string, unknown>): Promise<any> {
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    method: "POST",
    headers: {
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json().catch(() => ({}));
}

/**
 * Exchange an Embedded Signup OAuth code for a long-lived access token.
 * The client_secret is passed as a query param per Meta's OAuth spec.
 */
export async function exchangeCodeForToken(code: string): Promise<string> {
  const params = new URLSearchParams({
    client_id: FB_APP_ID,
    redirect_uri: REDIRECT_URI,
    client_secret: FB_APP_SECRET,
    code,
  });
  const data = await graphGet(`/oauth/access_token?${params.toString()}`);
  if (!data.access_token) throw new Error("OAuth exchange returned no access_token");
  return data.access_token as string;
}
