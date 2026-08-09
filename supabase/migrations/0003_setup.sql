-- AI Proof - runtime setup
-- 1. Seed a default org so new users have somewhere to put assets.
-- 2. Auto-create a profile (joined to the default org) for every new auth user.
-- 3. Create the public storage bucket used to host artwork files.

insert into public.organizations (name, slug)
values ('My Agency', 'default')
on conflict (slug) do nothing;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  select id into v_org from public.organizations where slug = 'default';
  if v_org is null then
    insert into public.organizations (name, slug)
    values ('My Agency', 'default')
    returning id into v_org;
  end if;

  insert into public.profiles (id, full_name, org_id, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(coalesce(new.email, 'user'), '@', 1)),
    v_org,
    'owner'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

insert into storage.buckets (id, name, public)
values ('artifacts', 'artifacts', true)
on conflict (id) do update set public = true;

create policy "artifacts public read"
  on storage.objects for select
  using (bucket_id = 'artifacts');
