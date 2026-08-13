# AI Proof — Marketing Asset Quality Gate (MVP)

Repo: https://github.com/usama453/wallnut · Live: https://aiproof-beta.vercel.app

Auto-deploys to Vercel on every push to `main`.

AI-powered proofreading + QA for marketing assets. Upload an image or PDF and
get a score, an annotated issue overlay and an approval workflow — before you
publish or send to print.

## WhatsApp tech-provider (Embedded Signup)

The app lets other businesses connect their own WhatsApp Business Account via
**Facebook Login for Business (Embedded Signup)** and get AI proofs in WhatsApp.

### One-time Meta Developer setup

1. Create an app at https://developers.facebook.com (type **Business**) and
   click **WhatsApp > Embedded Signup**.
2. **WhatsApp > Tech Provider**, choose an app mode, set a contact email, then
   **Create Config** — copy the generated **Config ID**.
3. In the app's **Settings > Basic**, copy the **App ID** and **App Secret**.
4. **Business Verification**, then **App Review > Permissions and Features**,
   request: `whatsapp_business_management`, `whatsapp_business_messaging`,
   `whatsapp_business_manage_events` (only the first two need review). Submit for
   review, then **App Mode: Live**.

### Environment variables

```bash
NEXT_PUBLIC_FB_APP_ID=          # Meta app id (public)
NEXT_PUBLIC_TP_CONFIG_ID=       # Tech Provider Config ID (public)
FB_APP_ID=                      # server-side copy
FB_APP_SECRET=                  # app secret (server-only)
TP_CONFIG_ID=                   # same as NEXT_PUBLIC_TP_CONFIG_ID
FB_REG_PIN=                     # 6-digit PIN to register phone numbers
TP_CONTACT_EMAIL=               # contact email used in the TP config
FB_GRAPH_API_VERSION=v22.0
FB_REDIRECT_URI=                # OAuth redirect; must match app OAuth settings
```

Embedded Signup flow: the app's **Connect WhatsApp** page opens the Meta popup
(`FB.login` with the Tech Provider Config), the returned code is exchanged in
`/api/token` for a long-lived token, stored per-WABA in `provider_wabas`, the
phone is registered (`/register`) and the app subscribed to the WABA webhook
(`/{wabaId}/subscribed_apps`). Inbound messages resolve the phone number's own
token from `provider_phones`, so each business is isolated.

