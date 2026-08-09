import { jwtVerify, createRemoteJWKSet, decodeJwt } from "jose";

const BOT_FRAMEWORK_OPENID = "https://login.botframework.com/v1/.well-known/openidconfiguration";
const TOKEN_ENDPOINT = (tenant: string) =>
  `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;

interface OpenIdConfig {
  issuer: string[];
  jwksUri: string;
}

let openIdCache: OpenIdConfig | null = null;
let jwksCache: Awaited<ReturnType<typeof createRemoteJWKSet>> | null = null;

async function getOpenIdConfig(): Promise<OpenIdConfig> {
  if (openIdCache) return openIdCache;
  const res = await fetch(BOT_FRAMEWORK_OPENID, { cache: "no-store" });
  if (!res.ok) throw new Error(`failed to fetch Bot Framework openid config: ${res.status}`);
  const cfg = await res.json();
  openIdCache = { issuer: cfg.issuer as string[], jwksUri: cfg.jwks_uri as string };
  return openIdCache;
}

function getJwks(jwksUri: string) {
  if (jwksCache) return jwksCache;
  jwksCache = createRemoteJWKSet(new URL(jwksUri), { cooldownDuration: 60_000 });
  return jwksCache;
}

/**
 * Verify the Authorization Bearer token sent by the Bot Framework service.
 * Accepts both v1 (sts.windows.net) and v2 (login.microsoftonline.com) tokens:
 * tries the Bot Framework signing keys first, then the tenant's v2 keys.
 */
export async function validateInboundToken(token: string): Promise<boolean> {
  const appId = process.env.TEAMS_BOT_ID;
  if (!appId) return false;

  const cfg = await getOpenIdConfig();

  try {
    const { payload } = await jwtVerify(token, getJwks(cfg.jwksUri), {
      issuer: [...cfg.issuer, "https://login.microsoftonline.com/botframework.com/v2.0"],
      audience: appId,
    });
    return payload.aud === appId;
  } catch {
    // Fallback for v2 tokens signed by Microsoft Identity (per-tenant keys).
    try {
      const decoded = decodeJwt(token) as { tid?: string };
      const tenant = decoded.tid ?? "botframework.com";
      const jwks = createRemoteJWKSet(
        new URL(`https://login.microsoftonline.com/${tenant}/discovery/v2.0/keys`),
      );
      const { payload } = await jwtVerify(token, jwks, {
        issuer: [
          `https://login.microsoftonline.com/${tenant}/v2.0`,
          `https://sts.windows.net/${tenant}/`,
        ],
        audience: appId,
      });
      return payload.aud === appId;
    } catch {
      return false;
    }
  }
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

let tokenCache: CachedToken | null = null;

/**
 * OAuth client-credentials token used for all outbound Bot Framework calls
 * (replies and media downloads). Cached until shortly before expiry.
 */
export async function getBotAccessToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt) return tokenCache.token;

  const appId = process.env.TEAMS_BOT_ID;
  const password = process.env.TEAMS_BOT_PASSWORD;
  if (!appId || !password) throw new Error("TEAMS_BOT_ID / TEAMS_BOT_PASSWORD not configured");

  // Try the app's home tenant first (bots registered in the customer tenant),
  // then fall back to the classic botframework.com directory for BCR apps.
  const tenants = [
    process.env.TEAMS_BOT_TENANT,
    "botframework.com",
  ].filter(Boolean) as string[];

  let lastError = "";
  for (const tenant of tenants) {
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: appId,
      client_secret: password,
      scope: "https://api.botframework.com/.default",
    });

    const res = await fetch(TOKEN_ENDPOINT(tenant), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (res.ok) {
      const data = await res.json();
      if (data.access_token) {
        tokenCache = {
          token: data.access_token,
          expiresAt: Date.now() + (Number(data.expires_in ?? 3600) - 60) * 1000,
        };
        return tokenCache.token;
      }
      lastError = "token endpoint returned no access token";
    } else {
      const text = await res.text();
      lastError = `token endpoint (${tenant}) failed (${res.status}): ${text.slice(0, 200)}`;
    }
  }

  throw new Error(lastError || "failed to acquire bot token");
}
