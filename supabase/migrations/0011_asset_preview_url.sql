-- Per-version preview thumbnail, e.g. the rasterized first page of a PDF.
-- NULL for image versions (their stored `url` is already previewable), and for
-- PDF versions that have not yet been proofed. runProof writes this field.
alter table public.asset_versions
  add column if not exists preview_url text;

comment on column public.asset_versions.preview_url is 'Rendered preview image (e.g. PDF first page).';
