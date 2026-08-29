# Supabase auth configuration

## Redirect URLs (dashboard)

**Where to find them:** Supabase Dashboard → **Authentication** → **URL Configuration**

Direct link for this project:
[https://supabase.com/dashboard/project/iczutfmnixkhhdvlprtn/auth/url-configuration](https://supabase.com/dashboard/project/iczutfmnixkhhdvlprtn/auth/url-configuration)

| Setting | Value |
| --- | --- |
| **Site URL** | `https://wallnut.usama.fun` |
| **Redirect URLs** | `https://wallnut.usama.fun/**` |
| | `https://wallnut.usama.fun/auth/callback` |
| Local dev | `http://localhost:3000/**` |

These are also managed in `supabase/config.toml` and can be pushed with:

```bash
supabase config push
```

## Email templates (dashboard)

**Where to find them:** Supabase Dashboard → **Authentication** → **Email Templates**

Direct link:
[https://supabase.com/dashboard/project/iczutfmnixkhhdvlprtn/auth/templates](https://supabase.com/dashboard/project/iczutfmnixkhhdvlprtn/auth/templates)

Wallnut-branded HTML lives in `supabase/templates/`:

| Dashboard template | File | Subject |
| --- | --- | --- |
| Invite user | `invite.html` | You are invited to Wallnut |
| Confirm sign up | `confirmation.html` | Confirm your Wallnut account |
| Magic link | `magic_link.html` | Your Wallnut sign-in link |
| Reset password | `recovery.html` | Reset your Wallnut password |

### Applying templates

On the **free tier with Supabase's default email provider**, templates must be pasted manually in the dashboard. `supabase config push` cannot update them via API.

1. Open each template in the dashboard (links above).
2. Copy the HTML from the matching file in `supabase/templates/`.
3. Paste into the template body and set the subject from the table.
4. Save.

To print all templates to the terminal:

```bash
npx tsx scripts/print-email-templates.mts
```

Once you configure **custom SMTP** (Authentication → SMTP Settings), you can uncomment the `[auth.email.template.*]` blocks in `config.toml` and run `supabase config push` to deploy templates from git.
