-- Groups explicitly removed from a workspace should stay silent until re-linked.
create table if not exists whatsapp_disconnected_groups (
  group_jid text primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  disconnected_at timestamptz not null default now()
);

create index if not exists whatsapp_disconnected_groups_org_idx
  on whatsapp_disconnected_groups (org_id);

alter table whatsapp_disconnected_groups enable row level security;
