-- Short public slugs for shareable report links (/r/<slug>).
alter table public.assets
  add column if not exists slug text;

-- Backfill existing assets with a short random code.
update public.assets
set slug = lower(substr(md5(random()::text || clock_timestamp()::text || id::text), 1, 10))
where slug is null or slug = '';

create unique index if not exists assets_slug_key on public.assets (slug);
