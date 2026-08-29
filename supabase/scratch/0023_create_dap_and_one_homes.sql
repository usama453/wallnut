-- Create public workspaces DAP and One Homes.
-- Does not move existing users (profiles.org_id is one org per account).
-- Idempotent: safe to re-run.

insert into public.organizations (name, slug, is_public, tagline, accent_color)
values
  ('DAP', 'dap', true, 'Design and production', '#8B4513'),
  ('One Homes', 'one-homes', true, null, '#3d5a80')
on conflict (slug) do update set
  name = excluded.name,
  is_public = true,
  tagline = coalesce(public.organizations.tagline, excluded.tagline),
  accent_color = coalesce(public.organizations.accent_color, excluded.accent_color);

insert into public.groups (org_id, name, platform, external_id)
select o.id, 'General', 'whatsapp', null
from public.organizations o
where o.slug in ('dap', 'one-homes')
on conflict (org_id, name, platform) do nothing;
