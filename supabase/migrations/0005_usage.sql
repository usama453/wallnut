-- Usage analytics for the WhatsApp bot: one row per inbound/outbound/status event.
create table if not exists whatsapp_usage (
  id bigint generated always as identity primary key,
  direction text not null check (direction in ('inbound', 'outbound')),
  msg_type text,
  message_id text,
  from_phone text,
  to_phone text,
  group_id text,
  status text,
  error_code text,
  error_detail text,
  asset_id uuid,
  created_at timestamptz not null default now()
);

alter table whatsapp_usage enable row level security;

-- Writes happen via the service-role client (bypasses RLS); the dashboard reads
-- with a signed-in user's session.
create policy "whatsapp_usage select authenticated" on public.whatsapp_usage
  for select using (auth.role() = 'authenticated');

create index if not exists idx_usage_created on public.whatsapp_usage(created_at desc);
