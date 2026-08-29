-- Opt-in metadata for the public organization directory.
-- Private workspaces stay private unless explicitly published.

alter table public.organizations
  add column if not exists is_public boolean not null default false,
  add column if not exists tagline text,
  add column if not exists accent_color text;

create index if not exists organizations_public_idx
  on public.organizations (is_public, name)
  where is_public = true;

update public.organizations
set
  is_public = true,
  tagline = coalesce(tagline, 'Design and production'),
  accent_color = coalesce(accent_color, '#8B4513')
where slug = 'dap';
