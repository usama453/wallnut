/**
 * Meta / WhatsApp tech-provider configuration.
 * App id + secret come from the Meta Developer app. The legacy env names
 * (WHATSAPP_APP_SECRET) are kept so existing setups keep working.
 */

export const FB_APP_ID = process.env.FB_APP_ID ?? "";
export const FB_APP_SECRET =
  process.env.FB_APP_SECRET ?? process.env.WHATSAPP_APP_SECRET ?? "";
export const GRAPH_API_VERSION = process.env.FB_GRAPH_API_VERSION ?? "v22.0";
/** 6-digit PIN used to register WhatsApp phone numbers. */
export const FB_REG_PIN = process.env.FB_REG_PIN ?? "";
/** Tech Provider Configuration id (created in the Meta Developer Dashboard). */
export const TP_CONFIG_ID = process.env.TP_CONFIG_ID ?? "";
export const TP_CONTACT_EMAIL = process.env.TP_CONTACT_EMAIL ?? "";
export const REDIRECT_URI =
  process.env.FB_REDIRECT_URI ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

/* ============================================================================
 * WAHA Configuration (used when mode === "waha")
 * ============================================================================ */

export const WAHA_BASE_URL = process.env.WAHA_BASE_URL ?? "http://localhost:3000";
export const WAHA_API_KEY = process.env.WAHA_API_KEY ?? "";
export const WAHA_SESSION = process.env.WAHA_SESSION ?? "default";
