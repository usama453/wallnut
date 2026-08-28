-- 0018: Unique constraint on (org_id, external_id) for groups.
--
-- The handler tries to claim a WhatsApp group by inserting a groups row keyed
-- by the group JID (external_id). Two different groups in the same org cannot
-- share a JID, so we need a unique constraint so the upsert (onConflict) lands
-- on the right row instead of colliding on name.
--
-- external_id is nullable for Slack/Teams groups; PostgreSQL allows multiple
-- NULLs in a unique column, so this does not interfere with non-WhatsApp groups.

create unique index if not exists idx_groups_org_external
  on groups (org_id, external_id);
