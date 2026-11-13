-- A ticket never overrides current access. Check the buyer, listing, room, owner approval,
-- current stored file and the log row on every authenticated storage read.
begin;
alter table kalling_private.dataroom_tickets enable row level security;

create or replace function kalling_private.dataroom_ticket_ok(p_path text)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(
  select 1 from kalling_private.dataroom_tickets t
  join public.kalling_buyers b on b.id=t.buyer_id and b.user_id=t.user_id
  join public.kalling_dataroom_items i on i.id=t.item_id
  join public.kalling_portal_files f on f.id=i.file_id and f.portal_id=i.portal_id
  where t.user_id=auth.uid() and t.object_path=p_path
   and t.created_at<=now() and t.created_at>now()-interval '2 minutes'
   and f.object_path=t.object_path and f.status='stored'
   and kalling_private.dataroom_visible(i,kalling_private.dataroom_tier(i.listing_id,b.id))
   and exists(select 1 from public.kalling_dataroom_events e
    where e.ticket=t.id and e.buyer_id=b.id and e.item_id=i.id and e.listing_id=i.listing_id
     and (e.event='opened' or (e.event='downloaded' and i.allow_download)))
 )
$$;
revoke all on function kalling_private.dataroom_ticket_ok(text) from public,anon;
grant execute on function kalling_private.dataroom_ticket_ok(text) to authenticated;
-- A buyer must not turn a ticket into a portable signed URL that outlives revocation.
alter policy kalling_dataroom_read on storage.objects using(
 bucket_id='kalling-portal' and storage.allow_only_operation('object.get_authenticated')
 and kalling_private.dataroom_ticket_ok(name)
);
comment on function kalling_private.dataroom_ticket_ok(text) is
 'Logged, short-lived read ticket plus current buyer and owner authorization. Use authenticated Storage downloads, never signed URLs.';
commit;
