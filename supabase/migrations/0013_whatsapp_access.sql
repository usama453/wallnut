-- WhatsApp response gating: respond only to specific people/groups,
-- configurable from the dashboard settings page.

create table if not exists whatsapp_settings (
  org_id uuid primary key references organizations(id) on delete cascade,
  response_mode text not null default 'all' check (response_mode in ('all', 'allowlist')),
  updated_at timestamptz not null default now()
);

create table if not exists whatsapp_allowlist (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  chat_id text not null,
  label text,
  created_at timestamptz not null default now(),
  unique (org_id, chat_id)
);

-- Chats that have messaged the bot (for one-click allow in the dashboard).
create table if not exists whatsapp_seen_chats (
  chat_id text primary key,
  org_id uuid references organizations(id) on delete set null,
  label text,
  message_count integer not null default 1,
  last_message_at timestamptz not null default now()
);

alter table whatsapp_settings enable row level security;
alter table whatsapp_allowlist enable row level security;
alter table whatsapp_seen_chats enable row level security;

create policy "whatsapp_settings select org" on public.whatsapp_settings
  for select using (org_id = public.my_org_id());
create policy "whatsapp_settings modify org" on public.whatsapp_settings
  for all using (org_id = public.my_org_id()) with check (org_id = public.my_org_id());

create policy "whatsapp_allowlist select org" on public.whatsapp_allowlist
  for select using (org_id = public.my_org_id());
create policy "whatsapp_allowlist modify org" on public.whatsapp_allowlist
  for all using (org_id = public.my_org_id()) with check (org_id = public.my_org_id());

create policy "whatsapp_seen_chats select org" on public.whatsapp_seen_chats
  for select using (org_id = public.my_org_id());
