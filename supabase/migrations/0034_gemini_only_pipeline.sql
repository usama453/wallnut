-- Direct Gemini is the only proofing path.

update public.org_proof_settings
  set pipeline_mode = 'gemini_only'
  where pipeline_mode is distinct from 'gemini_only';

alter table public.org_proof_settings
  alter column pipeline_mode set default 'gemini_only';
