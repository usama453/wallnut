# Wallnut — Session Summary

_Last updated: 31 Aug 2026_

Use this file to pick up work on another machine. Repo: `https://github.com/usama453/wallnut.git`

---

## What Wallnut Is

AI proofreading for marketing assets shared via WhatsApp. Flow:

1. Team sends images/PDFs to a linked WhatsApp group
2. Wallnut runs OCR + AI proof checks (typos, grammar, etc.)
3. A public report link is shared back (`/reports/{slug}` or `/r/{slug}`)
4. Org dashboard at `/{org-slug}` shows groups, reports, rankings, settings

**Production:** https://wallnut.usama.fun  
**VPS:** `root@153.92.211.187` (deploy via `./deploy/vps-deploy.sh`)  
**Stack:** Next.js 15, Supabase (auth + DB + storage), Docker on VPS, Baileys WhatsApp bridge

---

## Latest Work (uncommitted on this machine)

### 1. Password-protected dashboard access from reports

**Goal:** Public report viewers can open the org dashboard with a shared password (no Supabase account).

**New files:**
- `src/lib/dashboard-access.ts` — scrypt password verify, JWT cookie (7-day TTL)
- `src/app/api/org/dashboard-access/route.ts` — `POST` unlock, `DELETE` exit guest session
- `src/components/dashboard-access-form.tsx` — password gate UI
- `src/components/report-dashboard-link.tsx` — "Open {org} workspace" button on reports
- `supabase/migrations/0032_org_dashboard_password.sql` — `organizations.dashboard_password_hash`
- `src/components/dashboard-password-panel.tsx`  Guest password settings UI
- `src/app/api/settings/dashboard-password/route.ts`  Super-admin password API

**Modified:**
- `src/lib/org-access.ts` — new statuses: `password_required`, guest `ok` with `isGuest: true`
- `src/app/[slug]/layout.tsx` — shows password form when required
- `src/app/[slug]/page.tsx` — guests cannot manage proof settings or add groups
- `src/app/reports/[id]/page.tsx` — fetches org + shows workspace button
- `src/components/wallnut/app-header.tsx` — guest mode (limited nav, "Exit workspace")

**How it works:**
1. Report page → "Open {Org} workspace" → `/{org-slug}`
2. If not signed in and org has a password → password form
3. Correct password → httpOnly cookie `wallnut_dash_{orgId}` → guest dashboard (read-only)
4. Team members can still use "Sign in with email" link on the password form

**Password configuration:** Super admin → **Settings** → **Guest dashboard password** (per org, via org cookie). Set, update, or remove the password there. Requires migration `0032_org_dashboard_password.sql`.

### 2. Google login disabled

- `src/components/login-form.tsx` — Google button commented out
- `src/app/api/auth/google/route.ts` — redirects back with `error=google_disabled`
- Email/password and magic link still work

### 3. Previously shipped (commit `978405c`, live on production)

**Rankings fixes:**
- `src/lib/stats.ts` — include synced WhatsApp contacts even with 0 uploads
- `src/components/rankings.tsx` — show #1 in Typos Rank list (not only hero)
- `src/lib/whatsapp/contacts.ts` — prefer fuller contact names (e.g. "Usama Wallnut")

**Per-org proof settings (commit `6d9c291`):**
- Table `org_proof_settings` (checks, response_style, pipeline_mode)
- Migrations: `0030_org_proof_settings.sql`, `0031_org_proof_pipeline_mode.sql`
- Settings scoped per org via `?org=slug` API

**Report UI polish:**
- No score ring on public reports
- "Findings" → "Suggestions"
- Date moved into Suggestions card
- Super-admin-only Transcription block on report page
- Modal centering fix for remove-group dialog

---

## Local Dev Setup (another computer)

```bash
git clone https://github.com/usama453/wallnut.git
cd wallnut
npm ci

# Copy env from VPS or your secrets store:
# deploy/.env needs at minimum:
#   NEXT_PUBLIC_SUPABASE_URL
#   NEXT_PUBLIC_SUPABASE_ANON_KEY
#   SUPABASE_SERVICE_ROLE_KEY
#   NEXT_PUBLIC_APP_URL
#   GEMINI_API_KEY (for proof pipeline)
#   WAHA_API_KEY
# Optional:
#   DASHBOARD_ACCESS_SECRET (defaults to service role key)

npm run dev
# → http://localhost:3000
```

**Supabase migrations:** Run any new files in `supabase/migrations/` via Supabase dashboard SQL editor (project linked to production).

**Deploy to production:**
```bash
git add -A && git commit -m "..." && git push origin main
./deploy/vps-deploy.sh
```

---

## Key Routes

| Route | Auth | Purpose |
|-------|------|---------|
| `/` | Public | Org directory |
| `/login`, `/login/{slug}` | Public | Email/password sign-in |
| `/{slug}` | Member or guest password | Org dashboard |
| `/{slug}/rankings` | Member or guest password | Team rankings |
| `/reports/{id}` | Public | Proof report (id or slug) |
| `/r/{slug}` | Public | Short redirect to report |
| `/settings` | Super admin | Global settings shell |
| `/connect` | Super admin | WhatsApp bridge pairing |

---

## Architecture Notes

**Auth layers:**
1. Supabase session — full member access (team, settings, upload, etc.)
2. Dashboard password cookie — guest read-only (overview + rankings only)
3. Public — reports, org directory

**Rankings data:** `getStats(orgId)` in `src/lib/stats.ts`
- Attribution via `whatsapp_usage` → assets → proofs → `proof_issues`
- Contact sync: `syncOrgWhatsAppGroupContacts()` (WAHA, 60s TTL)

**Proof pipeline:** Split (transcribe → QA → spellcheck) or `gemini_only`
- Model: `gemini-3.5-flash-lite`
- Per-org config in `org_proof_settings`

**Storage:** Images/PDFs in Supabase `artifacts` bucket; VPS runs app + bridge only.

---

## Pending / Next Steps

- [ ] Commit + push + deploy the password-gate changes (currently uncommitted)
- [ ] Apply migration `0032_org_dashboard_password.sql` on Supabase
- [ ] Set guest dashboard passwords in Settings (super admin, per org)
- [ ] Test: open a report → "Open workspace" → enter password → see dashboard
- [ ] Test: guest cannot add groups, change proof settings, or access /connect
- [ ] Re-enable Google OAuth when ready (uncomment in `login-form.tsx` + restore `api/auth/google/route.ts`)

**Optional future work (not requested):**
- Malaysia VPS migration
- Gemini quota dashboard
- Move file storage from Supabase to VPS

---

## Important Files

```
src/app/reports/[id]/page.tsx       Public report page
src/app/[slug]/page.tsx             Org dashboard
src/app/[slug]/layout.tsx           Org auth gate
src/lib/org-access.ts               Access resolution
src/lib/dashboard-access.ts         Guest password + cookie
src/lib/stats.ts                    Rankings computation
src/lib/proof/proof-settings-store.ts  Per-org proof config
src/components/login-form.tsx       Sign-in UI
src/components/dashboard-grid.tsx   Main dashboard
deploy/vps-deploy.sh                Production deploy script
deploy/.env                         Production secrets (on VPS only)
```

---

## Git State (as of last session)

- **Production commit:** `978405c` — rankings fixes
- **Uncommitted:** password-gate feature + Google login disabled (this session)

```bash
git status   # verify before committing
git diff     # review changes
```
