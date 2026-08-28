-- Per-user orgs + email invites.
--
-- Previously every account landed in one shared 'default' org, so all
-- signups saw the same reports. Now:
--   1. organizations_users tracks membership (active) and pending invites.
--   2. On signup, if the email was invited, the user joins that org; otherwise
--      they get their own private org (isolated dashboard/reports).

create table if not exists organizations_users (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  invited_email text,
  invited_by uuid references auth.users(id) on delete set null,
  role text not null default 'member' check (role in ('owner','admin','member','viewer')),
  status text not null default 'pending' check (status in ('pending','active')),
  created_at timestamptz not null default now(),
  unique (user_id),
  unique (org_id, invited_email)
);

comment on table organizations_users is
  'Org membership and pending email invites. user_id set + status=active for members; invited_email set + status=pending for pending invites.';

alter table organizations_users enable row level security;

-- Members can view members/invites of their own org.
create policy "members select own org members"
  on organizations_users for select
  to authenticated
  using (org_id = my_org_id());

-- Any authenticated member of the org can invite (owner/admin enforcement is
-- handled in the API layer; a helper fn below limits who can manage).
create policy "members insert own org invites"
  on organizations_users for insert
  to authenticated
  with check (org_id = my_org_id());

-- Owner/admin can update (activate, remove, change role) members.
create policy "owner admin update members"
  on organizations_users for update
  to authenticated
  using (org_id = my_org_id() and exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.org_id = my_org_id()
      and p.role in ('owner','admin')
  ));

-- Owner/admin can delete members.
create policy "owner admin delete members"
  on organizations_users for delete
  to authenticated
  using (org_id = my_org_id() and exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.org_id = my_org_id()
      and p.role in ('owner','admin')
  ));

-- Handle the insert of a new auth user.
--   1. Join an org by a pending email invite if one exists.
--   2. Otherwise create a fresh, private org for the user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_invite record;
  v_org uuid;
begin
  v_email := lower(coalesce(new.email, ''));

  -- 1) Pending invite? Join that org as the invited member.
  select * into v_invite
    from public.organizations_users
    where status = 'pending'
      and lower(invited_email) = v_email
    limit 1;

  if v_invite.id is not null then
    insert into public.profiles (id, full_name, org_id, role)
    values (
      new.id,
      coalesce(new.raw_user_meta_data->>'full_name', split_part(v_email, '@', 1)),
      v_invite.org_id,
      v_invite.role
    )
    on conflict (id) do nothing;

    update public.organizations_users
      set user_id = new.id,
          status = 'active',
          invited_email = null
      where id = v_invite.id;

    return new;
  end if;

  -- 2) No invite → own private org.
  insert into public.organizations (name, slug)
  values (
    coalesce(new.raw_user_meta_data->>'full_name', split_part(v_email, '@', 1)) || '''s workspace',
    'user-' || substr(new.id::text, 1, 13)
  )
  returning id into v_org;

  insert into public.profiles (id, full_name, org_id, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(v_email, '@', 1)),
    v_org,
    'owner'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;
