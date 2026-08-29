-- Optional WhatsApp display names for rankings avatars.
alter table public.whatsapp_contacts
  add column if not exists display_name text;

create index if not exists whatsapp_contacts_org_name_idx
  on public.whatsapp_contacts (org_id, display_name)
  where display_name is not null;
