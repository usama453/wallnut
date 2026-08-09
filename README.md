# AI Proof — Marketing Asset Quality Gate (MVP)

Repo: https://github.com/usama453/wallnut · Live: https://aiproof-beta.vercel.app

AI-powered proofreading + QA for marketing assets. Upload an image or PDF and
get a score, an annotated issue overlay and an approval workflow — before you
publish or send to print.

## Stack

- **Frontend**: Next.js 15 (App Router), React 19, Tailwind CSS v4, TypeScript
- **Backend**: Supabase (PostgreSQL, Storage, Auth)
- **OCR**: Tesseract.js (free, runs locally)
- **AI**: Gemini 2.5 Flash (Google AI Studio free tier) — abstracted behind a
  single `AiProvider` interface so models can be swapped later
- **Image processing**: Sharp (PDFs rasterized with pdf-to-img)
- **Hosting**: Vercel

## Getting started

1. Install deps and copy the env file:

   ```bash
   npm install
   cp .env.example .env.local
   ```

2. Create a Supabase project (supabase.com). Fill in `.env.local`:

   ```
   NEXT_PUBLIC_SUPABASE_URL=
   NEXT_PUBLIC_SUPABASE_ANON_KEY=
   SUPABASE_SERVICE_ROLE_KEY=
   ```

3. Apply the database schema. Either open `supabase/migrations/0001_init.sql`
   in the Supabase SQL editor and run it, or use the CLI: `supabase db push`.

4. Get a free Gemini API key from https://aistudio.google.com and set
   `GEMINI_API_KEY=` in `.env.local`.

   > For local development with **zero cost and no keys**, set `AI_PROVIDER=mock`.
   > The mock provider returns a deterministic report and never calls the network.

5. Run:

   ```bash
   npm run dev
   ```

6. (Optional) Verify the OCR + AI pipeline without Supabase:

   ```bash
   npm run test:pipeline
   ```

## What's implemented (MVP scope)

- **Auth** — email/password + magic link via Supabase
- **Upload** — image or PDF: drag & drop, file picker, clipboard paste
- **OCR** — Tesseract extracts all visible text (local, free)
- **AI proofing** — Gemini 2.5 Flash reviews text, marketing copy, layout,
  contrast, safe margins, brand rules, links; returns a structured report
- **Report** — 0–100 score, status (passed / needs review / errors), issue
  list with category, severity, description, suggestion and artwork coords
- **Annotated preview** — numbered markers drawn over the artwork; clicking an
  issue (or marker) highlights its position
- **Brand profile** — colors, fonts, tone, preferred terminology, banned words,
  style guide; violations are flagged in every proof
- **Approval workflow** — draft → in review → changes requested → approved →
  published, with a full approval history
- **Version history** — every upload creates a new version; proofs are stored
  per version and compared against the previous one (consistency checks)
- **Shareable report link** — `/reports/[assetId]` is public and needs no login
- **WhatsApp Business bot** — send an image or PDF to your WhatsApp number;
  the bot replies in-thread with a score card and Approve / Request changes /
  View Report buttons. Button presses update the asset's approval status.

## WhatsApp Business setup

1. Get the credentials from the Meta for Developers / WhatsApp Cloud API setup:
   - `WHATSAPP_TOKEN` — system user access token
   - `WHATSAPP_PHONE_ID` — the phone number ID for your WhatsApp Business number
   - `WHATSAPP_VERIFY_TOKEN` — any string you choose (used for webhook verification)
   - `WHATSAPP_APP_SECRET` — app secret (used to verify incoming signatures)
2. Add them to `.env.local`:
   ```
   WHATSAPP_TOKEN=...
   WHATSAPP_PHONE_ID=...
   WHATSAPP_VERIFY_TOKEN=...
   WHATSAPP_APP_SECRET=...
   # Optional: where to put uploads from unknown senders
   WHATSAPP_DEFAULT_ORG_ID=<your org uuid>
   ```
3. Configure the webhook in Meta's dashboard to point at
   `{YOUR_URL}/api/whatsapp/webhook` and subscribe to the **messages** field.
   The endpoint handles both verification (GET) and incoming events (POST).
4. For local development without Meta, set `WHATSAPP_MOCK=1` — signature checks
   are skipped so you can test the endpoint with curl.
5. Apply `supabase/migrations/0002_whatsapp.sql` for the phone → org contact
   mapping, or rely on `WHATSAPP_DEFAULT_ORG_ID` alone.

Test the parsing/signature logic without any credentials:

```bash
npm run test:whatsapp
```

## Swapping the AI provider

All providers implement `AiProvider` in `src/lib/ai/provider.ts`:

```ts
analyzeAsset(input: AnalyzeInput): Promise<AnalyzeOutput>
```

- `src/lib/ai/gemini.ts` — Gemini 2.5 Flash (structured JSON output)
- `src/lib/ai/mock.ts` — offline mock for dev/demos/tests

Set `AI_PROVIDER=gemini | mock` (and `GEMINI_MODEL=...`) in your environment.
Adding OpenAI, Claude, OpenRouter or local Ollama later means adding one more
class in `src/lib/ai/` and wiring it in `src/lib/ai/index.ts`.

## Project structure

```
src/
  app/            pages + API routes (upload, proof, approval, auth callback)
  components/     sidebar, upload dropzone, asset viewer, login form, UI kit
  lib/
    ai/           provider abstraction, Gemini + mock, report parser
    ocr/          Tesseract service
    proof/        runProof pipeline (store -> rasterize -> OCR -> AI -> persist)
    supabase/     client / server / admin / middleware
  types/          shared domain types
supabase/
  migrations/     0001_init.sql (full schema + RLS)
scripts/          smoke-pipeline.mjs (pipeline self-test)
```

## Roadmap (out of MVP scope)

Slack / Teams bots, Figma plugin, Drive/Canva/Adobe Express integrations,
team invites + roles, billing (Stripe), diff between versions, and automated
job scheduling via Trigger.dev / n8n.
