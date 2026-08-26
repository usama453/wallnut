-- AI Sales Navigator - MVP schema
-- Run via: supabase db push  (or paste into the SQL editor)

create extension if not exists "pgcrypto";

-- ── Deals ─────────────────────────────────────────────────────────────
create table if not exists deals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  company_name text not null,
  contact_name text,
  contact_role text,
  deal_value numeric,
  currency text not null default 'USD',
  stage text not null default 'discovery',
  health_score int check (health_score between 0 and 100),
  summary text,
  main_risk text,
  status text not null default 'open' check (status in ('open', 'won', 'lost')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── People involved in a deal ────────────────────────────────────────
create table if not exists deal_people (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals(id) on delete cascade,
  name text not null,
  role text,
  relationship text,
  influence text,
  sentiment text,
  status text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (deal_id, name)
);

-- ── Structured facts (what we know / don't know) ─────────────────────
create table if not exists deal_facts (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals(id) on delete cascade,
  category text not null,
  key text not null,
  value text not null,
  confidence text not null default 'known' check (confidence in ('known', 'assumed', 'unknown')),
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (deal_id, category, key)
);

-- ── Transcripts pasted / uploaded by the salesperson ────────────────
create table if not exists deal_transcripts (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals(id) on delete cascade,
  title text not null default 'Call transcript',
  content text not null,
  analyzed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- ── Structured AI analysis per transcript ────────────────────────────
create table if not exists deal_analyses (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals(id) on delete cascade,
  transcript_id uuid references deal_transcripts(id) on delete set null,
  stage text,
  health_score int check (health_score between 0 and 100),
  analysis_json jsonb not null default '{}'::jsonb,
  model text,
  created_at timestamptz not null default now()
);

-- ── Next Best Actions ────────────────────────────────────────────────
create table if not exists deal_actions (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals(id) on delete cascade,
  title text not null,
  description text,
  reason text,
  priority text not null default 'medium' check (priority in ('high', 'medium', 'low')),
  timing text,
  status text not null default 'open' check (status in ('open', 'completed', 'superseded', 'cancelled')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

-- ── Activity / deal memory timeline ──────────────────────────────────
create table if not exists deal_activity (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals(id) on delete cascade,
  type text not null,
  title text not null,
  detail text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ── Indexes ──────────────────────────────────────────────────────────
create index if not exists idx_deal_people_deal on public.deal_people(deal_id);
create index if not exists idx_deal_facts_deal on public.deal_facts(deal_id);
create index if not exists idx_deal_transcripts_deal on public.deal_transcripts(deal_id);
create index if not exists idx_deal_analyses_deal on public.deal_analyses(deal_id);
create index if not exists idx_deal_actions_deal on public.deal_actions(deal_id);
create index if not exists idx_deal_activity_deal on public.deal_activity(deal_id);

-- ── RLS (open for the no-sign-in MVP; user_id column kept for later) ──
alter table public.deals enable row level security;
alter table public.deal_people enable row level security;
alter table public.deal_facts enable row level security;
alter table public.deal_transcripts enable row level security;
alter table public.deal_analyses enable row level security;
alter table public.deal_actions enable row level security;
alter table public.deal_activity enable row level security;

create policy "deals all" on public.deals for all using (true) with check (true);
create policy "deal_people all" on public.deal_people for all using (true) with check (true);
create policy "deal_facts all" on public.deal_facts for all using (true) with check (true);
create policy "deal_transcripts all" on public.deal_transcripts for all using (true) with check (true);
create policy "deal_analyses all" on public.deal_analyses for all using (true) with check (true);
create policy "deal_actions all" on public.deal_actions for all using (true) with check (true);
create policy "deal_activity all" on public.deal_activity for all using (true) with check (true);