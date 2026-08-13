-- Tech provider framework (Embedded Signup): per-business WhatsApp connections.
-- Tokens are exchanged during the Facebook Login for Business OAuth flow and
-- scoped per WhatsApp Business Account / phone number so the app can serve
-- multiple businesses (multi-tenant), mirroring Meta's sample app.
-- Writes (token exchange, phone ops) go through the service-role admin client,
-- which bypasses RLS; reads are org-scoped for signed-in members.

create table if not exists provider_wabas (
  id bigint generated always as identity primary key,
  waba_id bigint not null,
  org_id uuid references organizations(id) on delete cascade,
  business_id bigint,
  access_token text,
  last_updated timestamptz default now(),
  ts timestamptz default now()
);
create unique index if not exists provider_wabas_waba_key on provider_wabas (waba_id);
alter table provider_wabas enable row level security;
create policy "provider_wabas select org" on public.provider_wabas
  for select using (org_id = public.my_org_id());

create table if not exists provider_phones (
  id bigint generated always as identity primary key,
  phone_number_id bigint not null,
  waba_id bigint not null,
  org_id uuid references organizations(id) on delete cascade,
  business_id bigint,
  display_phone text,
  is_ack_bot_enabled boolean not null default false,
  ack_bot_message text not null default '',
  access_token text,
  last_updated timestamptz default now(),
  ts timestamptz default now()
);
create unique index if not exists provider_phones_phone_key on provider_phones (phone_number_id);
alter table provider_phones enable row level security;
create policy "provider_phones select org" on public.provider_phones
  for select using (org_id = public.my_org_id());

-- Webhook viewer: raw inbound payloads for debugging / QA during app review.
create table if not exists webhook_events (
  id bigint generated always as identity primary key,
  direction text not null default 'inbound',
  phone_number_id text,
  waba_id text,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists webhook_events_created_idx on webhook_events (created_at desc);
alter table webhook_events enable row level security;
create policy "webhook_events select authenticated" on public.webhook_events
  for select using (auth.role() = 'authenticated');
