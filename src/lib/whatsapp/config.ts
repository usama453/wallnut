/** WhatsApp (WAHA) configuration.
 * The bot runs exclusively in WAHA (Baileys) mode. No Meta / Cloud API. */

/** WAHA API base URL. */
export const WAHA_BASE_URL = process.env.WAHA_BASE_URL ?? "http://localhost:3000";
/** WAHA API key (X-Api-Key header). */
export const WAHA_API_KEY = process.env.WAHA_API_KEY ?? "";
/** WAHA session name. */
export const WAHA_SESSION = process.env.WAHA_SESSION ?? "default";
/** HMAC key configured for WAHA webhook delivery. */
export const WAHA_WEBHOOK_HMAC_KEY =
  process.env.WAHA_WEBHOOK_HMAC_KEY ??
  process.env.WHATSAPP_HOOK_HMAC_KEY ??
  "";

/** The bot's own WhatsApp number (with country code, no +).
 * e.g. 923345818677 */
export const BOT_PHONE_NUMBER = process.env.BOT_PHONE_NUMBER ?? "";
