import { WAHA_API_KEY, WAHA_BASE_URL, WAHA_SESSION } from "./config";

export interface WahaConnection {
  baseUrl: string;
  apiKey: string;
  session: string;
}

/** Resolve the WAHA connection for a given session.
 * WAHA-only: connection is configured via env (WAHA_BASE_URL, WAHA_API_KEY).
 * No Meta provider_phones / token lookup. */
export async function resolveConnection(session = WAHA_SESSION): Promise<WahaConnection | null> {
  if (!WAHA_BASE_URL || !WAHA_API_KEY) return null;
  try {
    const parsed = new URL(WAHA_BASE_URL);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return {
      baseUrl: parsed.origin,
      apiKey: WAHA_API_KEY,
      session,
    };
  } catch {
    return null;
  }
}
