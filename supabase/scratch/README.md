# Scratch SQL — not migrations

Files here are one-off data-reshuffle scripts. They deliberately live outside
`supabase/migrations/` so that `supabase db push` can never pick them up.

Do not move them back without reading them first.

## 0019_create_dap_org.sql

Creates a `dap` organization, makes `usama@getthenga.com` its owner, and seeds
four WhatsApp groups. Reassigning that user's `org_id` moves them out of
whatever workspace they currently belong to.

## 0020_cleanup_orgs.sql — DESTRUCTIVE

Ends with:

```sql
delete from public.organizations
where slug not in ('dap', 'public') and slug is not null;
```

Foreign keys cascade from `organizations` through `assets`, `proofs`, and
`issues`, so this deletes every org that is not `dap` or `public` along with all
of its reports, proofs, issues, and profile rows. As of the last check the only
org in the database was `default` ("My Agency"), meaning this script would erase
all existing production data.

Run it only after confirming the `dap` org exists and that losing every other
workspace is intended.

## 001_social_wall_posts.sql — DOES NOT PARSE

A `posts` table for a social-wall feature that no code in `src/` references.
It also has two syntax errors, so it could never have been applied:

- `references auth.users(on delete cascade)` is missing the column name; it
  should read `references auth.users(id) on delete cascade`.
- `alter publication ... add table if not exists` is not valid syntax;
  `ADD TABLE` has no `IF NOT EXISTS` form.

Both were confirmed against Postgres as `42601 syntax error`. While this file
sat in `supabase/migrations/` it broke `supabase db push` outright. Fix the two
statements before considering it a migration again.
