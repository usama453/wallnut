-- Add per-org pipeline mode for orgs created before pipeline_mode column existed.

alter table org_proof_settings
  add column if not exists pipeline_mode text not null default 'split'
  check (pipeline_mode in ('split', 'gemini_only'));
