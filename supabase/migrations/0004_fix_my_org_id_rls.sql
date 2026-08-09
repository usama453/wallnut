-- Fix RLS infinite recursion: my_org_id() queried profiles, which re-entered the
-- profiles select policy. Marking it security definer lets it read the caller's
-- profile without triggering RLS (it runs as the table owner, who bypasses RLS).
create or replace function public.my_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_id from public.profiles where id = auth.uid()
$$;
