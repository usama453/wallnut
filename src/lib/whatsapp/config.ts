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

/** Optional privacy LID digits when WhatsApp hides the bot's phone in groups. */
export const BOT_LID_NUMBER = process.env.BOT_LID_NUMBER ?? "";

/** Public contact email shown in bios, footers, and support replies. */
export const WALLNUT_CONTACT_EMAIL =
  process.env.WALLNUT_CONTACT_EMAIL ?? "hey@usama.fun";

/** Marketing site for group setup / learn more links. */
export const WALLNUT_SITE_URL =
  process.env.WALLNUT_SITE_URL ?? "https://usama.fun/wallnut/";
