-- Create the "dap" organization with its workspace groups.
-- Owner: usama@getthenga.com (resolved by email, not hardcoded id).
-- Idempotent: safe to re-run.

-- 1. Create the org by slug (Postgres assigns the UUID).
insert into public.organizations (name, slug)
values ('DAP', 'dap')
on conflict (slug) do nothing;

-- 2. Assign usama@getthenga.com as owner of dap, by email lookup.
insert into public.profiles (id, full_name, org_id, role)
select
  (select id from auth.users where lower(email) = 'usama@getthenga.com'),
  'usama',
  o.id,
  'owner'
from public.organizations o
where o.slug = 'dap'
  and exists (select 1 from auth.users where lower(email) = 'usama@getthenga.com')
on conflict (id) do update set
  org_id = excluded.org_id,
  role = excluded.role,
  full_name = excluded.full_name;

-- 3. The dap org's workspace groups (design, qa, marketing, sales).
insert into public.groups (org_id, name, platform, external_id)
select g.org_id, g.name, g.platform, g.external_id
from (values
  ('design',    'whatsapp', null),
  ('qa',        'whatsapp', null),
  ('marketing', 'whatsapp', null),
  ('sales',     'whatsapp', null)
) as g(name, platform, external_id)
cross join (select id from public.organizations where slug = 'dap') o
on conflict (org_id, name, platform) do nothing;
