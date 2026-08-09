-- Brand profile toggle: accept casual slang + Roman Urdu in proofing
alter table brand_profiles
  add column if not exists allow_slang_roman_urdu boolean not null default false;
