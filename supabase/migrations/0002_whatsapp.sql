-- WhatsApp Business integration: map an incoming phone number to an org/user
-- so that assets uploaded via WhatsApp land in the right workspace.
create table if not exists whatsapp_contacts (
  phone text primary key,
  org_id uuid references organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table whatsapp_contacts enable row level security;
create policy "whatsapp_contacts select org" on public.whatsapp_contacts
  for select using (org_id = public.my_org_id());
create policy "whatsapp_contacts insert org" on public.whatsapp_contacts
  for insert with check (org_id = public.my_org_id());
