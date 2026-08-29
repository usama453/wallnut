-- Public catch-all workspace + multi-org membership.
--
-- My Agency (slug default) becomes Public (slug public). Every signed-in user
-- can enter Public. The same person can also belong to private orgs (DAP,
-- One Homes, …) via organizations_users.

update public.organizations
set
  name = 'Public',
  slug = 'public',
  is_public = true,
  tagline = coalesce(nullif(tagline, ''), 'Open chats with Wallnut')
where slug = 'default';

alter table public.organizations_users
  drop constraint if exists organizations_users_user_id_key;

drop index if exists organizations_users_user_id_key;

create unique index if not exists organizations_users_org_user_idx
  on public.organizations_users (org_id, user_id)
  where user_id is not null;

create or replace function public.my_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select org_id from public.profiles where id = auth.uid()),
    (select id from public.organizations where slug = 'public'),
    (select id from public.organizations where slug = 'default')
  )
$$;

drop policy if exists "organizations select own" on public.organizations;
drop policy if exists "organizations select member or public" on public.organizations;
create policy "organizations select member or public"
  on public.organizations
  for select
  using (
    is_public = true
    or id = public.my_org_id()
    or exists (
      select 1
      from public.organizations_users
      where organizations_users.org_id = organizations.id
        and organizations_users.user_id = auth.uid()
        and organizations_users.status = 'active'
    )
  );

drop policy if exists "members select own org members" on public.organizations_users;
drop policy if exists "members select own memberships" on public.organizations_users;
create policy "members select own memberships"
  on public.organizations_users
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or org_id = public.my_org_id()
  );

insert into public.organizations_users (org_id, user_id, role, status)
select p.org_id, p.id, coalesce(p.role, 'member'), 'active'
from public.profiles p
where p.org_id is not null
  and not exists (
    select 1
    from public.organizations_users existing
    where existing.org_id = p.org_id
      and existing.user_id = p.id
  );

insert into public.organizations_users (org_id, user_id, role, status)
select o.id, p.id, coalesce(p.role, 'owner'), 'active'
from public.profiles p
join public.organizations o on o.slug = 'public'
where not exists (
  select 1
  from public.organizations_users existing
  where existing.org_id = o.id
    and existing.user_id = p.id
);

insert into public.organizations_users (org_id, user_id, role, status)
select o.id, u.id, 'owner', 'active'
from public.organizations o
join auth.users u
  on lower(u.email) in ('usama@getthenga.com', 'xalion.malik@gmail.com')
where o.slug in ('dap', 'one-homes')
  and not exists (
    select 1
    from public.organizations_users existing
    where existing.org_id = o.id
      and existing.user_id = u.id
  );

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_invite record;
  v_public uuid;
  v_name text;
begin
  v_email := lower(coalesce(new.email, ''));
  v_name := coalesce(
    new.raw_user_meta_data->>'full_name',
    split_part(coalesce(new.email, 'user'), '@', 1)
  );

  select id into v_public from public.organizations where slug = 'public' limit 1;

  select * into v_invite
    from public.organizations_users
    where status = 'pending'
      and lower(invited_email) = v_email
    limit 1;

  insert into public.profiles (id, full_name, org_id, role)
  values (
    new.id,
    v_name,
    coalesce(v_invite.org_id, v_public),
    coalesce(v_invite.role, 'member')
  )
  on conflict (id) do nothing;

  if v_public is not null then
    insert into public.organizations_users (org_id, user_id, role, status)
    select v_public, new.id, 'member', 'active'
    where not exists (
      select 1
      from public.organizations_users existing
      where existing.org_id = v_public
        and existing.user_id = new.id
    );
  end if;

  if v_invite.id is not null then
    update public.organizations_users
      set user_id = new.id,
          status = 'active',
          invited_email = null
      where id = v_invite.id;
  end if;

  return new;
end;
$$;
