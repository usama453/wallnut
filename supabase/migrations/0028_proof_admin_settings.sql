-- Admin-configurable proof checks and WhatsApp response style.
insert into public.platform_settings (key, value)
values
  (
    'proof_enabled_checks',
    '{"typos":true,"grammar":true,"punctuation":true,"capitalization":true,"consistency":true,"readability":true,"missing_content":true}'
  ),
  ('proof_response_style', 'human')
on conflict (key) do nothing;
