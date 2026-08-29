-- Xalion is the visible super admin. Usama stays a platform operator
-- (email allowlist) but is not listed on client workspaces.
update public.profiles p
set
  is_super_admin = (lower(u.email) = 'xalion.malik@gmail.com'),
  full_name = case
    when lower(u.email) = 'xalion.malik@gmail.com' then 'Xalion Malik'
    else p.full_name
  end
from auth.users u
where u.id = p.id
  and lower(u.email) in ('usama@getthenga.com', 'xalion.malik@gmail.com');

delete from public.organizations_users ou
using auth.users u, public.organizations o
where ou.user_id = u.id
  and ou.org_id = o.id
  and lower(u.email) = 'usama@getthenga.com'
  and o.slug is distinct from 'public';
