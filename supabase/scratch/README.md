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
