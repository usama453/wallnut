-- Per-page preview manifest so PDF previews can show every page with correctly
-- positioned issue markers. JSON shape: { pages: [{ url, width, height }] }.
-- NULL for versions that have not been proofed yet.
alter table public.asset_versions
  add column if not exists preview_meta jsonb;

comment on column public.asset_versions.preview_meta is 'Rendered preview page manifest { pages: [{url,width,height}] }';
