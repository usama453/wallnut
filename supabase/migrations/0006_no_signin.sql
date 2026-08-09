-- Remove the sign-in requirement.
-- 1. Anonymous visitors now resolve to the default org, so every existing
--    org-scoped RLS policy serves them the same data as a signed-in member
--    of that org (while logged-in users still see their own org).
-- 2. Let anonymous sessions read the usage analytics table.
create or replace function public.my_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select org_id from public.profiles where id = auth.uid()),
    (select id from public.organizations where slug = 'default')
  )
$$;

drop policy if exists "whatsapp_usage select authenticated" on public.whatsapp_usage;
create policy "whatsapp_usage select" on public.whatsapp_usage
  for select using (true);
