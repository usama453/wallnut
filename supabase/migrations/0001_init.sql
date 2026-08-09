-- AI Proof - initial schema
-- Run this in the Supabase SQL editor (or via supabase db push).

create extension if not exists "pgcrypto";

-- Organizations (a team / agency / company)
create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  created_at timestamptz not null default now()
);

-- Profiles linked to auth.users
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  org_id uuid references organizations(id) on delete set null,
  role text not null default 'member' check (role in ('owner', 'admin', 'member', 'viewer')),
  created_at timestamptz not null default now()
);

-- Projects (folders / campaigns / clients)
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  client text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Brand profile: colors, fonts, tone, rules, banned words
create table if not exists brand_profiles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null default 'Default',
  company_name text,
  colors jsonb not null default '[]'::jsonb,
  fonts jsonb not null default '[]'::jsonb,
  tone_of_voice text,
  logo_url text,
  preferred_terminology jsonb not null default '[]'::jsonb,
  banned_words jsonb not null default '[]'::jsonb,
  style_guide text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Assets: the artwork being proofed (one row per artwork, multiple versions)
create table if not exists assets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  name text not null,
  kind text not null check (kind in ('image', 'pdf')),
  mime text not null,
  current_version int not null default 1,
  status text not null default 'draft'
    check (status in ('draft', 'in_review', 'changes_requested', 'approved', 'published')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Versions: every upload creates a version
create table if not exists asset_versions (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references assets(id) on delete cascade,
  version int not null,
  storage_path text not null,
  url text not null,
  width int,
  height int,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (asset_id, version)
);

-- Proofs: one per version
create table if not exists proofs (
  id uuid primary key default gen_random_uuid(),
  asset_version_id uuid not null references asset_versions(id) on delete cascade,
  score int not null check (score between 0 and 100),
  status text not null check (status in ('passed', 'needs_review', 'errors')),
  summary text,
  ocr_text text,
  model text,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Issues discovered in a proof
create table if not exists proof_issues (
  id uuid primary key default gen_random_uuid(),
  proof_id uuid not null references proofs(id) on delete cascade,
  category text not null,
  severity text not null check (severity in ('low', 'medium', 'high')),
  title text not null,
  description text,
  suggestion text,
  -- normalized coordinates (0..1) on the artwork
  x float, y float, w float, h float,
  label text,
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  created_at timestamptz not null default now()
);

-- Comments threaded on an asset
create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references assets(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  body text not null,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

-- Approval history per version
create table if not exists approvals (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references assets(id) on delete cascade,
  version int not null,
  status text not null check (status in ('draft', 'in_review', 'changes_requested', 'approved', 'published')),
  reviewer_id uuid references auth.users(id) on delete set null,
  comment text,
  created_at timestamptz not null default now()
);

-- Simple RLS: members of an org can access org resources.
-- For a zero-setup MVP you can enable per-org policies; a baseline is below.

alter table organizations enable row level security;
alter table profiles enable row level security;
alter table projects enable row level security;
alter table brand_profiles enable row level security;
alter table assets enable row level security;
alter table asset_versions enable row level security;
alter table proofs enable row level security;
alter table proof_issues enable row level security;
alter table comments enable row level security;
alter table approvals enable row level security;

-- helper: return the caller's org id
create or replace function public.my_org_id()
returns uuid language sql stable as $$
  select org_id from public.profiles where id = auth.uid()
$$;

create policy "profiles select own and org" on public.profiles
  for select using (id = auth.uid() or org_id = public.my_org_id());

create policy "organizations select own" on public.organizations
  for select using (id = public.my_org_id());

create policy "projects select org" on public.projects
  for select using (org_id = public.my_org_id());

create policy "brand_profiles select org" on public.brand_profiles
  for select using (org_id = public.my_org_id());
create policy "brand_profiles insert org" on public.brand_profiles
  for insert with check (org_id = public.my_org_id());
create policy "brand_profiles update org" on public.brand_profiles
  for update using (org_id = public.my_org_id());

create policy "assets select org" on public.assets
  for select using (org_id = public.my_org_id());
create policy "assets insert org" on public.assets
  for insert with check (org_id = public.my_org_id());
create policy "assets update org" on public.assets
  for update using (org_id = public.my_org_id());

create policy "asset_versions select org" on public.asset_versions
  for select using (asset_id in (select id from public.assets where org_id = public.my_org_id()));
create policy "asset_versions insert org" on public.asset_versions
  for insert with check (asset_id in (select id from public.assets where org_id = public.my_org_id()));

create policy "proofs select org" on public.proofs
  for select using (asset_version_id in (
    select av.id from public.asset_versions av join public.assets a on a.id = av.asset_id where a.org_id = public.my_org_id()));
create policy "proofs insert org" on public.proofs
  for insert with check (asset_version_id in (
    select av.id from public.asset_versions av join public.assets a on a.id = av.asset_id where a.org_id = public.my_org_id()));

create policy "proof_issues select org" on public.proof_issues
  for select using (proof_id in (select p.id from public.proofs p
    join public.asset_versions av on av.id = p.asset_version_id
    join public.assets a on a.id = av.asset_id where a.org_id = public.my_org_id()));
create policy "proof_issues insert org" on public.proof_issues
  for insert with check (proof_id in (select p.id from public.proofs p
    join public.asset_versions av on av.id = p.asset_version_id
    join public.assets a on a.id = av.asset_id where a.org_id = public.my_org_id()));
create policy "proof_issues update org" on public.proof_issues
  for update using (proof_id in (select p.id from public.proofs p
    join public.asset_versions av on av.id = p.asset_version_id
    join public.assets a on a.id = av.asset_id where a.org_id = public.my_org_id()));

create policy "comments select org" on public.comments
  for select using (asset_id in (select id from public.assets where org_id = public.my_org_id()));
create policy "comments insert org" on public.comments
  for insert with check (asset_id in (select id from public.assets where org_id = public.my_org_id()));

create policy "approvals select org" on public.approvals
  for select using (asset_id in (select id from public.assets where org_id = public.my_org_id()));
create policy "approvals insert org" on public.approvals
  for insert with check (asset_id in (select id from public.assets where org_id = public.my_org_id()));

create index if not exists idx_asset_versions_asset on public.asset_versions(asset_id);
create index if not exists idx_proofs_version on public.proofs(asset_version_id);
create index if not exists idx_issues_proof on public.proof_issues(proof_id);
