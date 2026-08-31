-- Optional per-org password for guest dashboard access from public reports.

alter table public.organizations
  add column if not exists dashboard_password_hash text;

comment on column public.organizations.dashboard_password_hash is
  'scrypt hash (salt:hex) for password-gated dashboard viewing; managed in super-admin Settings';
