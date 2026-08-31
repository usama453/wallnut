-- Store guest dashboard password in plaintext for super-admin visibility.

alter table public.organizations
  add column if not exists dashboard_password text;

comment on column public.organizations.dashboard_password is
  'Guest dashboard password (super-admin visible in Settings); verified alongside dashboard_password_hash';
