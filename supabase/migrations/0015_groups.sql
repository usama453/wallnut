-- Communication-space groups + linking reports to them.
--
-- The dashboard is organized around "groups" — team workspaces / communication
-- channels across platforms (WhatsApp, Slack, Teams). Reports (assets) now
-- belong to a group so each group card can show its latest proofreading work.
--
--   1. `groups` table (org-scoped, platform-tagged).
--   2. `assets.group_id` → groups.
--   3. Seed groups from existing WhatsApp chats and put existing assets into
--      a "General" workspace group.

create table if not exists groups (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  platform text not null default 'whatsapp'
    check (platform in ('whatsapp','slack','teams')),
  external_id text,
  created_at timestamptz not null default now(),
  unique (org_id, name, platform)
);

comment on column groups.platform is
  'Where the group lives: whatsapp, slack, or teams.';

alter table assets
  add column if not exists group_id uuid references groups(id) on delete set null;

create index if not exists idx_assets_group on assets(group_id);
create index if not exists idx_groups_org on groups(org_id);
create unique index if not exists idx_groups_org_external on groups(org_id, external_id);

alter table groups enable row level security;

create policy "groups select org"
  on groups for select
  to authenticated
  using (org_id = my_org_id());
create policy "groups insert org"
  on groups for insert
  to authenticated
  with check (org_id = my_org_id());
create policy "groups update org"
  on groups for update
  to authenticated
  using (org_id = my_org_id());
create policy "groups delete org"
  on groups for delete
  to authenticated
  using (org_id = my_org_id());

-- Seed: one "General" workspace per org that already has assets, plus one
-- group per distinct WhatsApp chat seen.
insert into groups (org_id, name, platform, external_id)
select distinct a.org_id, 'General', 'whatsapp', null
from assets a
on conflict (org_id, name, platform) do nothing;

insert into groups (org_id, name, platform, external_id)
select distinct w.org_id,
       coalesce(nullif(w.label, ''), w.chat_id),
       'whatsapp',
       w.chat_id
from whatsapp_seen_chats w
on conflict (org_id, name, platform) do nothing;

-- Attach existing assets to their org's General group so nothing is orphaned.
update assets a
set group_id = g.id
from groups g
where g.org_id = a.org_id
  and g.name = 'General'
  and a.group_id is null;
