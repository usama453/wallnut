# Social Wall

A minimal, mobile-first web app for uploading social media posts (image + caption) from PC and viewing/copying/download on phone. Built with HTML/CSS/vanilla JavaScript, using Supabase for authentication, database, and storage.

---

## Core Workflow

**PC → Upload:**
1. Open the website.
2. Click `+ Add Post`.
3. Upload an image + enter a caption.
4. Post saves to Supabase → image to Storage, caption+URL to DB.

**Phone → View & Post:**
1. Open the same website (logged in with same Supabase account).
2. See all uploaded posts in the grid.
3. Open a post → `Copy Caption` → paste elsewhere.
4. `Download Image` → save the photo.

Changes on either device appear on the other instantly (Supabase Realtime).

---

## 1. Supabase Setup

### 1.1 Create the Posts Table

Run the migration SQL (or `supabase db push`):

```bash
supabase db push
# or apply supabase/migrations/001_social_wall_posts.sql in the SQL editor
```

The migration creates:
- `public.posts` table with columns: `id`, `user_id`, `image_url`, `image_path`, `caption`, `created_at`, `updated_at`
- Row Level Security policies (only the authenticated user can CRUD their own posts)
- Realtime publication on the `posts` table

### 1.2 Storage Bucket: `post-images`

Create a storage bucket named `post-images` in the Supabase Dashboard:

1. Go to **Storage** → **Browse** → **New Bucket**.
2. Name: `post-images`.
3. Set **Visibility**: `Public` (so images can be viewed via URL from both PC and phone).

**Optional (more secure):** Set bucket to `Private` and use signed URLs. The app currently uses a public bucket for simplicity — since RLS on the `posts` table already ensures only the authenticated user can see their own post URLs, this is sufficient for a personal utility.

### 1.3 Environment Variables (Frontend)

The frontend reads `SUPABASE_URL` and `SUPABASE_ANON_KEY`. You have two options:

#### Option A — Edit config.js (simplest for beginners)

Edit `social-wall/config.js` and replace:

```js
window.SUPABASE_URL = "__YOUR_SUPABASE_URL__";
window.SUPABASE_ANON_KEY = "__YOUR_SUPABASE_ANON_KEY__";
```

#### Option B — Set via Netlify/Vercel dashboard (cleaner for deployments)

1. **Netlify:** Site settings → Build & deploy → Environment variables → add:
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://your-project.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = `your-anon-key`

2. **Vercel:** Project Settings → Environment Variables → add:
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://your-project.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = `your-anon-key`

The app checks env vars first, then falls back to `config.js`. If using Netlify/Vercel env vars, you **do not** need to edit `config.js`.

---

## 2. Local Development

1. Install Supabase CLI (optional, for local db pushes):

```bash
npm install -g supabase
supabase login
```

2. Start the Supabase local backend:

```bash
supabase start
```

3. Apply migrations:

```bash
supabase db push
```

4. Run the website locally (any static server):

```bash
npx serve social-wall   # or python -m http.server from within social-wall
```

Open http://localhost:5000 (or whichever port).

---

## 3. Deployment (Netlify or Vercel)

### Netlify

1. Push your code to a GitHub repo.
2. Connect the repo to Netlify (new site from GitHub).
3. In the Netlify dashboard, go to **Site settings → Build & deploy → Environment variables** and add:
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://<your-project>.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = `your-anon-key`
4. Trigger a deploy (click "Deploy site").

Netlify will inject the env vars at build time. The app's `config.js` will pick them up automatically.

### Vercel

1. Import your GitHub repo to Vercel.
2. In **Project Settings → Environment Variables**, add:
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://<your-project>.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = `your-anon-key`
3. Deploy.

### Manual drag‑drop (no CI)

1. Install the Netlify CLI: `npm install -g netlify-cli`
2. `netlify init` (follow prompts, set up a new site)
3. `netlify build` (or just skip — static site needs no build step)
4. `netlify serve` to preview, then use the Netlify dashboard to add env vars.

---

## 4. How It Works (Technical Summary)

### Auth

- Supabase Auth with email/password (sign in / sign up).
- Session persisted in `localStorage` / cookies.
- On each page load, the app checks `supabase.auth.getSession()`.
- Unauthenticated users see the sign‑in modal; authenticated users see the posts grid.

### Database (Supabase Postgres)

- Table `public.posts` stores one row per post.
- RLS policy: `auth.uid() = user_id` — each user can only interact with their own rows.
- `created_at` and `updated_at` are auto‑managed via a trigger.
- Realtime is enabled on the `posts` table, so when a user adds/edits/deletes a post on one device, the UI on all other devices refreshes automatically.

### Storage (Supabase Storage bucket `post-images`)

- Images are uploaded by the authenticated user to a path like `posts/{userId}/{timestamp}.jpg`.
- Bucket visibility: **Public** (URLs are readable by anyone, but only the authenticated user sees the URLs in their posts thanks to DB RLS).
- On upload, the app generates a unique path to avoid collisions.
- On delete (edit with new image or remove post), the old file is removed from storage.

### Cross-device sync

- Supabase Realtime listens to `posts` table INSERT/UPDATE/DELETE.
- When a change occurs, `renderPosts()` refetches the row and the new post appears instantly on all open tabs/windows for the same user.

---

## 5. File Structure

```
social-wall/
├─ index.html          # Main HTML page (auth modals, grid, modals)
├─ styles.css          # Mobile-first minimal styling
├─ app.js            # Supabase CRUD, realtime, UI logic
├─ config.js         # window.SUPABASE_URL / window.SUPABASE_ANON_KEY (edit or use env vars)
├─ README.md         # This file
└─ supabase/
   └─ migrations/
      └─ 001_social_wall_posts.sql  # New: posts table + RLS + realtime
```

---

## 6. Customisation

- **Visual style:** Edit `styles.css` — colors are defined by CSS variables at the top (`--bg`, `--surface`, `--accent`, etc.). Light/dark mode follows `color-scheme: dark`.
- **Grid layout:** The posts grid is CSS grid. Mobile is single-column (< 480px), 2+ columns at wider screens. Adjust the media query breakpoints if desired.
- **Add post flow:** The `+ Add Post` modal handles image upload (Supabase Storage) + caption save (Supabase DB) in one step.
- **Search:** The search bar filters posts by caption text (client-side filter after DB fetch — sufficient for a small personal collection).

---

## 7. Security Notes

- **Never** commit real Supabase keys to public repos. Use environment variables (Netlify/Vercel) or keep `config.js` out of version control (add to `.gitignore`).
- The RLS policies in `001_social_wall_posts.sql` ensure each user can only access their own posts. Even if someone guessed a post URL, they couldn't view it without being authenticated as the owner.
- The Storage bucket is set to **Public** so images display on phone/PC. If you need tighter image privacy, set the bucket to **Private** and use Supabase signed URLs (requires a small code change in `app.js` to fetch `getPublicUrl({ signed: true })` with a short expiry).
- The app does **not** use `localStorage` for posting data — Supabase is the source of truth (as required).