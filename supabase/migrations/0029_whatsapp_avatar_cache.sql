-- Persist WhatsApp profile pictures so rankings/dashboard avatars survive restarts.
alter table public.whatsapp_contacts
  add column if not exists avatar_path text,
  add column if not exists avatar_mime text,
  add column if not exists avatar_cached_at timestamptz;

create index if not exists whatsapp_contacts_org_avatar_idx
  on public.whatsapp_contacts (org_id, avatar_cached_at desc nulls last)
  where avatar_path is not null;
