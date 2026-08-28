-- Allow authenticated org members to read WhatsApp usage scoped to their org.
-- whatsapp_usage has no org_id, so scope by the asset it touches (proof rows)
-- or by the connection phone it came through.
create policy "whatsapp_usage select org asset"
  on whatsapp_usage for select
  to authenticated
  using (
    asset_id in (
      select assets.id from assets where assets.org_id = my_org_id()
    )
  );

create policy "whatsapp_usage select org contact"
  on whatsapp_usage for select
  to authenticated
  using (
    coalesce(from_phone, to_phone) in (
      select whatsapp_contacts.phone
      from whatsapp_contacts
      where whatsapp_contacts.org_id = my_org_id()
    )
  );
