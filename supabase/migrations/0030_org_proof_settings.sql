-- Per-org Wallnut reply style and proof check toggles.

create table if not exists org_proof_settings (
  org_id uuid primary key references organizations(id) on delete cascade,
  checks jsonb not null,
  response_style text not null check (response_style in ('plain', 'mixed', 'human', 'custom')),
  pipeline_mode text not null default 'split' check (pipeline_mode in ('split', 'gemini_only')),
  updated_at timestamptz not null default now()
);

alter table org_proof_settings enable row level security;

create policy "org_proof_settings select org" on public.org_proof_settings
  for select using (org_id = public.my_org_id());
create policy "org_proof_settings modify org" on public.org_proof_settings
  for all using (org_id = public.my_org_id()) with check (org_id = public.my_org_id());
