-- Platform super admins can manage WhatsApp group linking in every workspace.
alter table public.profiles
  add column if not exists is_super_admin boolean not null default false;

update public.profiles p
set is_super_admin = true
from auth.users u
where u.id = p.id
  and lower(u.email) in ('usama@getthenga.com', 'xalion.malik@gmail.com');
