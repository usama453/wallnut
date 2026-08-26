-- Social Wall — posts table migration
-- Run: supabase db push or apply via SQL editor

create extension if not exists "pgcrypto";

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(on delete cascade),
  image_url text not null,
  image_path text not null,
  caption text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.posts enable row level security;

-- Users can view their own posts
create policy "posts select own" on public.posts
  for select using (auth.uid() = user_id);

-- Users can insert their own posts
create policy "posts insert own" on public.posts
  for insert with check (auth.uid() = user_id);

-- Users can update their own posts
create policy "posts update own" on public.posts
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Users can delete their own posts
create policy "posts delete own" on public.posts
  for delete using (auth.uid() = user_id);

-- updated_at trigger
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger posts_updated_at
  before update on public.posts
  for each row execute function handle_updated_at();

-- Enable realtime publication
alter publication supabase_realtime add table if not exists public.posts;
