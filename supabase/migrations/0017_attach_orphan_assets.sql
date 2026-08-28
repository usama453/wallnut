-- Attach any orphaned assets (no group) to their org's General workspace group
-- so every report is visible on the dashboard's group cards.
update assets a
set group_id = g.id
from groups g
where g.org_id = a.org_id
  and g.name = 'General'
  and a.group_id is null;
