-- Wipe stale orgs and reassign usama to dap.
-- Run via: psql $DATABASE_URL -f this_file.sql
-- OR via Supabase SQL editor.
-- Requires service-role or a role that can delete organizations.

set search_path = public;

-- 1. Freeze deletes so we can review before unfreezing.
--    Uncomment the next line after verifying the list below.
-- delete from public.organizations where slug in ('default');

-- Current state to verify BEFORE deleting:
select slug, id, (select count(*) from public.assets a where a.org_id = o.id) as assets,
       (select count(*) from public.profiles p where p.org_id = o.id) as members
from public.organizations o
order by slug;

-- 2. Map usama@getthenga.com to the dap org (idempotent).
--    Creates a profile row if missing; reassigns org_id if already present.
insert into public.profiles (id, full_name, org_id, role)
select
  (select id from auth.users where lower(email) = 'usama@getthenga.com'),
  'usama',
  (select id from public.organizations where slug = 'dap'),
  'owner'
where exists (select 1 from auth.users where lower(email) = 'usama@getthenga.com')
  and exists (select 1 from public.organizations where slug = 'dap')
on conflict (id) do update set
  org_id = excluded.org_id,
  role = excluded.role,
  full_name = excluded.full_name;

-- 3. Wipe everything except 'dap' and 'public'.
--    FKs are on delete cascade (assets → proofs → issues, etc.),
--    so deleting the org removes all its reports in one shot.
delete from public.organizations
where slug not in ('dap', 'public')
  and slug is not null;

-- 4. After delete: confirm only dap + public remain.
select slug, id, (select count(*) from public.assets a where a.org_id = o.id) as assets,
       (select count(*) from public.profiles p where p.org_id = o.id) as members
from public.organizations o
order by slug;
