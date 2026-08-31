# AI Proof — Marketing Asset Quality Gate (MVP)

Repo: https://github.com/usama453/wallnut · Live: https://wallnut.usama.fun

Production runs on a VPS (`wallnut.usama.fun`) with Docker (`app` + WhatsApp
`bridge`). After pushing to `main`, deploy with:

```bash
./deploy/vps-deploy.sh
```

To retire the old Vercel preview (`aiproof-beta.vercel.app`), delete the
`aiproof` project in the Vercel dashboard and disconnect the GitHub integration.
That URL is no longer referenced in this repo.

AI-powered proofreading + QA for marketing assets. Upload an image or PDF and
get a score, an annotated issue overlay and an approval workflow — before you
publish or send to print.

## WhatsApp (WAHA)

Wallnut uses a single WAHA-compatible session. Production runs the included
Baileys bridge in `baileys-bridge/`; a standard
[WAHA](https://waha.devlike.pro/) server can be used with the same API
contract. An owner or admin opens **Connect WhatsApp**, starts the session, and
scans its QR code. Incoming images and PDFs are proofed and answered in the
same chat.

### Environment variables

```bash
WAHA_BASE_URL=http://localhost:3001
WAHA_API_KEY=                   # must match the WAHA server
WAHA_SESSION=default
BOT_PHONE_NUMBER=              # digits only; used for group @mention checks
BOT_LID_NUMBER=                # optional; privacy LID digits if me.lid is unavailable
WHATSAPP_DEFAULT_ORG_ID=        # fallback workspace for direct messages

NEXT_PUBLIC_APP_URL=            # public Wallnut URL
WAHA_WEBHOOK_URL=               # optional explicit .../api/whatsapp/webhook URL
WAHA_WEBHOOK_HMAC_KEY=          # must match WAHA's webhook HMAC key
```

Run WAHA on a different port from Next.js. For local development, expose WAHA's
container port `3000` as host port `3001`, then run Wallnut on `3000` (or
another free port). The Connect screen checks service health, creates or
restarts the configured session, proxies the short-lived QR securely, and can
configure its inbound webhook when a public app URL is available.

To link a WhatsApp group to a workspace, generate an auth code in Wallnut and
paste it in that group. Auth codes are globally unique and expire after 24
hours.

