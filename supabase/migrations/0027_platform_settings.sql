-- Platform-wide settings (super admin only via service role API).
create table if not exists public.platform_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.platform_settings enable row level security;

-- No public policies — read/write through admin client only.

insert into public.platform_settings (key, value)
values ('proof_pipeline_mode', 'split')
on conflict (key) do nothing;
