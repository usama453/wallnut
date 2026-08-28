-- 0017: WhatsApp group auth codes + group claiming.
--
-- An org admin creates a short auth code from the dashboard. They paste it
-- into the target WhatsApp group; the bot sees the code in a group message,
-- marks the code used, links the group to the org, and replies confirming.
--
-- Tables:
--   whatsapp_group_auth_codes  — codes an org admin has generated
--   (groups table is already in place from 0015 — we add the linkage there)

create table if not exists whatsapp_group_auth_codes (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  code        text not null unique,                       -- e.g. "WN-A7F3K2"
  status      text not null default 'pending'
                check (status in ('pending', 'used', 'expired')),
  group_jid   text,                                        -- set when code is used inside a group
  group_name  text,                                        -- WhatsApp group subject at claim time
  expires_at  timestamptz not null default (now() + interval '24 hours'),
  created_at  timestamptz not null default now(),
  used_at     timestamptz
);

alter table whatsapp_group_auth_codes enable row level security;

-- Org members can see their own org's codes. Owner/admin can manage them.
create policy "wa.auth_codes select own org"
  on whatsapp_group_auth_codes for select
  to authenticated
  using (exists (
    select 1 from organizations_users
    where organizations_users.org_id = whatsapp_group_auth_codes.org_id
      and organizations_users.user_id = auth.uid()
      and organizations_users.status = 'active'
  ));

create policy "wa.auth_codes insert own org"
  on whatsapp_group_auth_codes for insert
  to authenticated
  with check (exists (
    select 1 from organizations_users
    where organizations_users.org_id = whatsapp_group_auth_codes.org_id
      and organizations_users.user_id = auth.uid()
      and organizations_users.status = 'active'
      and organizations_users.role in ('owner', 'admin')
  ));

create policy "wa.auth_codes update own org"
  on whatsapp_group_auth_codes for update
  to authenticated
  using (exists (
    select 1 from organizations_users
    where organizations_users.org_id = whatsapp_group_auth_codes.org_id
      and organizations_users.user_id = auth.uid()
      and organizations_users.status = 'active'
      and organizations_users.role in ('owner', 'admin')
  ));

create policy "wa.auth_codes delete own org"
  on whatsapp_group_auth_codes for delete
  to authenticated
  using (exists (
    select 1 from organizations_users
    where organizations_users.org_id = whatsapp_group_auth_codes.org_id
      and organizations_users.user_id = auth.uid()
      and organizations_users.status = 'active'
      and organizations_users.role in ('owner', 'admin')
  ));

-- Mark expired codes automatically (run via Supabase cron or a daily job).
-- For now the API filters expired codes on read; this function exists for
-- a future scheduled edge function.
create or replace function wa.mark_expired_auth_codes()
returns void
language plpgsql
security definer
as $$
begin
  update whatsapp_group_auth_codes
  set status = 'expired'
  where status = 'pending'
    and expires_at < now();
end;
$$;
