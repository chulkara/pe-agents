-- Kalling: the data room. Documents the owner approved, read-only for buyers who signed the NDA.
-- Every open writes a log row before a short-lived ticket is issued; storage serves a file only
-- for a ticket under two minutes old. No IP address or device fingerprint is stored.
-- Apply after 004, 005 and 011.
begin;

create table public.kalling_dataroom_rooms (
 listing_id uuid primary key references public.kalling_listings(id), portal_id uuid not null references public.kalling_portals(id),
 status text not null default 'Draft' check(status in ('Draft','Proposed','Published','Unpublished')),
 proposed_at timestamptz, published_at timestamptz, weekly_summary boolean not null default false
);
create table public.kalling_dataroom_items (
 id uuid primary key default gen_random_uuid(), listing_id uuid not null references public.kalling_dataroom_rooms(listing_id),
 portal_id uuid not null references public.kalling_portals(id), file_id uuid not null references public.kalling_portal_files(id),
 display_name text not null check(length(display_name) between 2 and 160),
 folder text not null check(folder in ('Overview','Financials','Operations','Customers','Team','Legal and licenses','Other')),
 tier text not null check(tier in ('After NDA','After LOI')), allow_download boolean not null default false,
 note text not null default '' check(length(note)<=400),
 owner_status text not null default 'Pending' check(owner_status in ('Pending','Approved','Removed')), owner_note text not null default '' check(length(owner_note)<=400),
 changed_at timestamptz not null default now(), approved_at timestamptz
);
create unique index kalling_dataroom_items_file on public.kalling_dataroom_items(listing_id,file_id) where owner_status<>'Removed';
create table public.kalling_dataroom_loi (
 listing_id uuid not null references public.kalling_listings(id), buyer_id uuid not null references public.kalling_buyers(id),
 note text not null check(length(note) between 5 and 400), by_user uuid not null references auth.users(id), by_name text not null, at timestamptz not null default now(),
 primary key(listing_id,buyer_id)
);
create table public.kalling_dataroom_events (
 id bigint generated always as identity primary key, listing_id uuid not null references public.kalling_listings(id),
 item_id uuid not null references public.kalling_dataroom_items(id) on delete cascade, buyer_id uuid not null references public.kalling_buyers(id),
 event text not null check(event in ('opened','page','downloaded','denied')), page integer check(page between 1 and 5000), seconds integer check(seconds between 0 and 600),
 ticket uuid, at timestamptz not null default now()
);
create index kalling_dataroom_events_listing on public.kalling_dataroom_events(listing_id,at);
create index kalling_dataroom_events_ticket on public.kalling_dataroom_events(ticket) where ticket is not null;
create table kalling_private.dataroom_tickets (
 id uuid primary key default gen_random_uuid(), user_id uuid not null, buyer_id uuid not null, item_id uuid not null,
 object_path text not null, created_at timestamptz not null default now()
);
create index dataroom_tickets_path on kalling_private.dataroom_tickets(object_path,user_id,created_at);
alter table public.kalling_listing_questions add column item_id uuid references public.kalling_dataroom_items(id) on delete set null,
 add column page integer check(page between 1 and 5000);

alter table public.kalling_dataroom_rooms enable row level security;
alter table public.kalling_dataroom_items enable row level security;
alter table public.kalling_dataroom_loi enable row level security;
alter table public.kalling_dataroom_events enable row level security;
-- Advisors and the owner read the room and its items directly. Buyers and the log go through the RPCs below.
create policy dataroom_rooms_read on public.kalling_dataroom_rooms for select to authenticated using(kalling_private.advisor_role() is not null or kalling_private.portal_role(portal_id)='seller');
create policy dataroom_items_read on public.kalling_dataroom_items for select to authenticated using(kalling_private.advisor_role() is not null or kalling_private.portal_role(portal_id)='seller');
create policy dataroom_loi_read on public.kalling_dataroom_loi for select to authenticated using(kalling_private.advisor_role() is not null);
revoke all on public.kalling_dataroom_rooms,public.kalling_dataroom_items,public.kalling_dataroom_loi,public.kalling_dataroom_events from public,anon,authenticated;
grant select on public.kalling_dataroom_rooms,public.kalling_dataroom_items,public.kalling_dataroom_loi to authenticated;
revoke all on kalling_private.dataroom_tickets from public,anon,authenticated;

-- ── Helpers ─────────────────────────────────────────────────────────────────────────────────
create function kalling_private.dataroom_tier(p_listing uuid,p_buyer uuid) returns integer language sql stable security definer set search_path='' as $$
 select case
  when not exists(select 1 from public.kalling_buyers b where b.id=p_buyer and b.status<>'Restricted') then 0
  when not exists(select 1 from public.kalling_listings l where l.id=p_listing and l.status in ('Live','Under LOI')) then 0
  when not exists(select 1 from public.kalling_dataroom_rooms r where r.listing_id=p_listing and r.status='Published') then 0
  when not exists(select 1 from public.kalling_access a where a.listing_id=p_listing and a.buyer_id=p_buyer and a.status='Approved') then 0
  when exists(select 1 from public.kalling_offers o where o.listing_id=p_listing and o.buyer_id=p_buyer and o.status='Accepted')
    or exists(select 1 from public.kalling_dataroom_loi g where g.listing_id=p_listing and g.buyer_id=p_buyer) then 2
  else 1 end
$$;
create function kalling_private.dataroom_visible(i public.kalling_dataroom_items,p_tier integer) returns boolean language sql immutable set search_path='' as $$
 select i.owner_status='Approved' and (case when i.tier='After NDA' then p_tier>=1 else p_tier>=2 end)
$$;
-- Same wording as anonymousBuyerLabel in lib/brokerage.ts: numbered by approval order on this listing.
create function kalling_private.dataroom_label(p_listing uuid,p_buyer uuid) returns text language sql stable security definer set search_path='' as $$
 select 'Buyer '||coalesce((select n::text from (select a.buyer_id,row_number() over(order by a.created_at,a.id) n from public.kalling_access a where a.listing_id=p_listing and a.status='Approved') x where x.buyer_id=p_buyer),'?')
  ||', '||lower((select type from public.kalling_buyers where id=p_buyer))
$$;
create function kalling_private.dataroom_ticket_ok(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from kalling_private.dataroom_tickets t where t.object_path=p_path and t.user_id=auth.uid() and t.created_at>now()-interval '2 minutes')
$$;
create policy kalling_dataroom_read on storage.objects for select to authenticated using(bucket_id='kalling-portal' and kalling_private.dataroom_ticket_ok(name));

-- ── Advisor ─────────────────────────────────────────────────────────────────────────────────
create function public.kalling_dataroom_save_item(p jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare v_listing uuid=(p->>'listingId')::uuid; v_portal uuid=(p->>'portalId')::uuid; v_file uuid=(p->>'fileId')::uuid; v_id uuid=nullif(p->>'id','')::uuid;
 old public.kalling_dataroom_items; v_name text=left(trim(coalesce(p->>'displayName','')),160); v_dl boolean=coalesce((p->>'allowDownload')::boolean,false); material boolean; begin
 perform kalling_private.need_advisor(); perform kalling_private.portal_need(v_portal,array['firm-write']);
 if not exists(select 1 from public.kalling_listings where id=v_listing) then raise exception 'Listing not found.'; end if;
 if exists(select 1 from public.kalling_listing_private lp join public.kalling_portals pt on pt.id=v_portal where lp.listing_id=v_listing and lp.company_id is not null and lp.company_id<>pt.company_id) then raise exception 'This portal belongs to a different company.'; end if;
 if not exists(select 1 from public.kalling_portal_files f where f.id=v_file and f.portal_id=v_portal and f.status='stored') then raise exception 'Choose a document from this owner portal.'; end if;
 if length(v_name)<2 then raise exception 'Name the document as buyers will see it.'; end if;
 insert into public.kalling_dataroom_rooms(listing_id,portal_id) values(v_listing,v_portal) on conflict(listing_id) do nothing;
 if v_id is null then
  if exists(select 1 from public.kalling_dataroom_items where listing_id=v_listing and file_id=v_file and owner_status<>'Removed') then raise exception 'This document is already in the data room.'; end if;
  insert into public.kalling_dataroom_items(listing_id,portal_id,file_id,display_name,folder,tier,allow_download,note)
   values(v_listing,v_portal,v_file,v_name,p->>'folder',p->>'tier',v_dl,left(coalesce(p->>'note',''),400)) returning id into v_id; return v_id; end if;
 select * into old from public.kalling_dataroom_items where id=v_id and listing_id=v_listing for update; if old.id is null then raise exception 'Item not found.'; end if;
 -- Anything that changes what buyers get needs the owner to approve it again.
 material=old.file_id<>v_file or old.tier<>(p->>'tier') or old.allow_download<>v_dl or old.folder<>(p->>'folder');
 update public.kalling_dataroom_items set file_id=v_file,display_name=v_name,folder=p->>'folder',tier=p->>'tier',allow_download=v_dl,note=left(coalesce(p->>'note',''),400),changed_at=now(),
  owner_status=case when material then 'Pending' else owner_status end,owner_note=case when material then '' else owner_note end,approved_at=case when material then null else approved_at end where id=v_id;
 return v_id;
end $$;
create function public.kalling_dataroom_remove_item(p_item uuid) returns void language plpgsql security definer set search_path='' as $$
begin perform kalling_private.need_advisor();
 -- The log keeps the item's history; the item leaves the room and buyers lose access at once.
 update public.kalling_dataroom_items set owner_status='Removed',owner_note='Removed by the advisor',changed_at=now() where id=p_item;
end $$;
create function public.kalling_dataroom_set_status(p_listing uuid,p_status text) returns void language plpgsql security definer set search_path='' as $$
declare n int; pending int; begin perform kalling_private.need_advisor();
 if p_status not in ('Proposed','Published','Unpublished') then raise exception 'Unknown data room status.'; end if;
 if not exists(select 1 from public.kalling_dataroom_rooms where listing_id=p_listing) then raise exception 'Add documents to the data room first.'; end if;
 select count(*),count(*) filter(where owner_status<>'Approved') into n,pending from public.kalling_dataroom_items where listing_id=p_listing and owner_status<>'Removed';
 if p_status in ('Proposed','Published') and n=0 then raise exception 'Add at least one document.'; end if;
 if p_status='Published' and pending>0 then raise exception 'The owner must approve every document before the data room opens.'; end if;
 update public.kalling_dataroom_rooms set status=p_status,proposed_at=case when p_status='Proposed' then now() else proposed_at end,published_at=case when p_status='Published' then now() else published_at end where listing_id=p_listing;
end $$;
create function public.kalling_dataroom_grant_loi(p_listing uuid,p_buyer uuid,p_note text) returns void language plpgsql security definer set search_path='' as $$
begin perform kalling_private.need_advisor();
 if length(trim(coalesce(p_note,'')))<5 then raise exception 'Add a note saying why this buyer gets after-LOI documents.'; end if;
 insert into public.kalling_dataroom_loi(listing_id,buyer_id,note,by_user,by_name) values(p_listing,p_buyer,left(trim(p_note),400),auth.uid(),kalling_private.actor_name())
  on conflict(listing_id,buyer_id) do update set note=excluded.note,by_user=excluded.by_user,by_name=excluded.by_name,at=now();
end $$;
create function public.kalling_dataroom_advisor(p_listing uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin perform kalling_private.need_advisor();
 return jsonb_build_object(
  'room',(select to_jsonb(r) from public.kalling_dataroom_rooms r where r.listing_id=p_listing),
  'items',coalesce((select jsonb_agg(to_jsonb(i)||jsonb_build_object('file_name',f.name,'mime',f.mime) order by i.folder,i.display_name) from public.kalling_dataroom_items i join public.kalling_portal_files f on f.id=i.file_id where i.listing_id=p_listing),'[]'),
  'events',coalesce((select jsonb_agg(jsonb_build_object('buyer_id',e.buyer_id,'item_id',e.item_id,'event',e.event,'page',e.page,'seconds',e.seconds,'at',e.at) order by e.at) from public.kalling_dataroom_events e where e.listing_id=p_listing),'[]'),
  'buyers',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'name',b.name,'label',kalling_private.dataroom_label(p_listing,b.id))) from public.kalling_buyers b where b.id in (select buyer_id from public.kalling_dataroom_events where listing_id=p_listing)),'[]'),
  'loi',coalesce((select jsonb_agg(jsonb_build_object('buyer_id',g.buyer_id,'note',g.note,'by_name',g.by_name,'at',g.at)) from public.kalling_dataroom_loi g where g.listing_id=p_listing),'[]'));
end $$;

-- ── Owner ───────────────────────────────────────────────────────────────────────────────────
create function public.kalling_dataroom_owner_decide(p_items uuid[],p_decision text,p_note text) returns void language plpgsql security definer set search_path='' as $$
declare i public.kalling_dataroom_items; begin
 if p_decision not in ('Approved','Removed') then raise exception 'Choose approve or remove.'; end if;
 if p_decision='Removed' and length(trim(coalesce(p_note,'')))<3 then raise exception 'Say why this should not be shared.'; end if;
 for i in select * from public.kalling_dataroom_items where id=any(p_items) for update loop
  if kalling_private.portal_role(i.portal_id) is distinct from 'seller' then raise exception 'This document is not in your data room.' using errcode='42501'; end if; end loop;
 if (select count(*) from public.kalling_dataroom_items where id=any(p_items))<>cardinality(p_items) then raise exception 'This document is not in your data room.' using errcode='42501'; end if;
 update public.kalling_dataroom_items set owner_status=p_decision,owner_note=left(trim(coalesce(p_note,'')),400),approved_at=case when p_decision='Approved' then now() else approved_at end where id=any(p_items);
end $$;
create function public.kalling_dataroom_weekly(p_listing uuid,p_on boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.kalling_dataroom_rooms r where r.listing_id=p_listing and kalling_private.portal_role(r.portal_id)='seller') then raise exception 'Data room not found.' using errcode='42501'; end if;
 update public.kalling_dataroom_rooms set weekly_summary=coalesce(p_on,false) where listing_id=p_listing;
end $$;
-- Who opened what, by document, anonymous labels only. Same shape as ownerLog in lib/dataRoom.ts.
create function kalling_private.dataroom_owner_log(p_listing uuid,p_since timestamptz) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('item',x.display_name,'entries',x.entries) order by x.display_name),'[]') from (
  select i.display_name,jsonb_agg(jsonb_build_object('label',kalling_private.dataroom_label(p_listing,g.buyer_id),'opens',g.opens,'last',g.last,'downloaded',g.downloads>0) order by g.last desc) entries
  from public.kalling_dataroom_items i join (
   select item_id,buyer_id,count(*) filter(where event='opened') opens,count(*) filter(where event='downloaded') downloads,max(at) last
   from public.kalling_dataroom_events where listing_id=p_listing and event in ('opened','downloaded') and at>=p_since group by item_id,buyer_id) g on g.item_id=i.id
  where i.listing_id=p_listing group by i.id,i.display_name) x
$$;
create function kalling_private.dataroom_summary(p_listing uuid) returns text language sql stable security definer set search_path='' as $$
 select case when jsonb_array_length(l)=0 then 'No buyer opened a document in the data room this week.'
  else 'Data room this week:'||(select string_agg(chr(10)||(d->>'item')||': '||(select string_agg((e->>'label')||' ('||(e->>'opens')||' open'||case when (e->>'opens')='1' then '' else 's' end||case when (e->>'downloaded')::boolean then ', downloaded' else '' end||')','; ') from jsonb_array_elements(d->'entries') e),'') from jsonb_array_elements(l) d) end
 from (select kalling_private.dataroom_owner_log(p_listing,now()-interval '7 days') l) s
$$;
create function public.kalling_dataroom_owner() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('listing_id',r.listing_id,'number',l.number,'room',to_jsonb(r),
  'items',coalesce((select jsonb_agg(to_jsonb(i)||jsonb_build_object('file_name',f.name,'mime',f.mime) order by i.folder,i.display_name) from public.kalling_dataroom_items i join public.kalling_portal_files f on f.id=i.file_id where i.listing_id=r.listing_id),'[]'),
  'log',kalling_private.dataroom_owner_log(r.listing_id,'-infinity'),'summary',kalling_private.dataroom_summary(r.listing_id))),'[]')
 from public.kalling_dataroom_rooms r join public.kalling_listings l on l.id=r.listing_id
 where auth.uid() is not null and r.status<>'Draft' and kalling_private.portal_role(r.portal_id)='seller'
$$;

-- ── Buyers ──────────────────────────────────────────────────────────────────────────────────
create function public.kalling_dataroom_buyer(p_listing uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare b public.kalling_buyers=kalling_private.my_buyer(); t int; begin
 t=case when b.id is null then 0 else kalling_private.dataroom_tier(p_listing,b.id) end;
 return jsonb_build_object('tier',t,'items',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'display_name',i.display_name,'folder',i.folder,'tier',i.tier,'mime',f.mime,'allow_download',i.allow_download,'note',i.note,'open',kalling_private.dataroom_visible(i,t)) order by i.folder,i.display_name)
  from public.kalling_dataroom_items i join public.kalling_portal_files f on f.id=i.file_id where i.listing_id=p_listing and i.owner_status='Approved' and t>0),'[]'));
end $$;
-- The log row is written first. A denied open is logged too and returns an error instead of raising,
-- so the log row is kept.
create function kalling_private.dataroom_open(p_item uuid,p_kind text) returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.kalling_buyers=kalling_private.my_buyer(); i public.kalling_dataroom_items; f public.kalling_portal_files; t int; ok boolean; tk uuid; begin
 if auth.uid() is null or b.id is null then raise exception 'Sign in with your buyer profile first.' using errcode='42501'; end if;
 select * into i from public.kalling_dataroom_items where id=p_item; if i.id is null then raise exception 'Document not found.'; end if;
 if (select count(*) from public.kalling_dataroom_events where buyer_id=b.id and event in ('opened','downloaded','denied') and at>now()-interval '1 minute')>=30 then raise exception 'Too many documents opened in a minute. Wait a moment and try again.'; end if;
 t=kalling_private.dataroom_tier(i.listing_id,b.id); ok=kalling_private.dataroom_visible(i,t) and (p_kind='opened' or i.allow_download);
 if not ok then
  insert into public.kalling_dataroom_events(listing_id,item_id,buyer_id,event) values(i.listing_id,i.id,b.id,'denied');
  return jsonb_build_object('error',case when p_kind='downloaded' and kalling_private.dataroom_visible(i,t) then 'This document can be viewed but not downloaded.' else 'You do not have access to this document.' end); end if;
 select * into f from public.kalling_portal_files where id=i.file_id;
 tk=gen_random_uuid();
 insert into public.kalling_dataroom_events(listing_id,item_id,buyer_id,event,ticket) values(i.listing_id,i.id,b.id,p_kind,tk);
 delete from kalling_private.dataroom_tickets where created_at<now()-interval '1 hour';
 insert into kalling_private.dataroom_tickets(id,user_id,buyer_id,item_id,object_path) values(tk,auth.uid(),b.id,i.id,f.object_path);
 return jsonb_build_object('ticket',tk,'path',f.object_path,'name',i.display_name,'file_name',f.name,'mime',f.mime,'allow_download',i.allow_download,
  'watermark',b.name||', '||b.email||', '||to_char(now() at time zone 'utc','YYYY-MM-DD')||'. Confidential, Kalling data room');
end $$;
create function public.kalling_dataroom_open(p_item uuid) returns jsonb language sql security definer set search_path='' as $$ select kalling_private.dataroom_open(p_item,'opened') $$;
create function public.kalling_dataroom_download(p_item uuid) returns jsonb language sql security definer set search_path='' as $$ select kalling_private.dataroom_open(p_item,'downloaded') $$;
create function public.kalling_dataroom_events(p_ticket uuid,p_events jsonb) returns void language plpgsql security definer set search_path='' as $$
declare k kalling_private.dataroom_tickets; i public.kalling_dataroom_items; n int; begin
 select * into k from kalling_private.dataroom_tickets where id=p_ticket and user_id=auth.uid();
 if k.id is null then raise exception 'This viewing session is not yours.' using errcode='42501'; end if;
 if jsonb_typeof(p_events)<>'array' or jsonb_array_length(p_events)>50 then raise exception 'Send at most 50 page events at a time.'; end if;
 select count(*) into n from public.kalling_dataroom_events where ticket=p_ticket and event='page';
 if n+jsonb_array_length(p_events)>400 then raise exception 'Too many page events for one viewing.'; end if;
 select * into i from public.kalling_dataroom_items where id=k.item_id;
 insert into public.kalling_dataroom_events(listing_id,item_id,buyer_id,event,page,seconds,ticket)
  select i.listing_id,i.id,k.buyer_id,'page',greatest(1,least(5000,round((e->>'page')::numeric)::int)),greatest(0,least(600,round((e->>'seconds')::numeric)::int)),p_ticket from jsonb_array_elements(p_events) e;
end $$;
create function public.kalling_dataroom_history() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('at',e.at,'document',i.display_name,'listing',l.number) order by e.at desc),'[]')
 from public.kalling_dataroom_events e join public.kalling_dataroom_items i on i.id=e.item_id join public.kalling_listings l on l.id=e.listing_id
 where e.event='opened' and e.buyer_id=(kalling_private.my_buyer()).id
$$;
create function public.kalling_dataroom_ask(p_item uuid,p_page integer,p_body text) returns void language plpgsql security definer set search_path='' as $$
declare b public.kalling_buyers=kalling_private.my_buyer(); i public.kalling_dataroom_items; begin
 select * into i from public.kalling_dataroom_items where id=p_item;
 if b.id is null or i.id is null or not kalling_private.dataroom_visible(i,kalling_private.dataroom_tier(i.listing_id,b.id)) then raise exception 'You do not have access to this document.' using errcode='42501'; end if;
 if length(trim(coalesce(p_body,'')))<2 then raise exception 'Write your question.'; end if;
 insert into public.kalling_listing_questions(listing_id,buyer_id,side,author,body,item_id,page) values(i.listing_id,b.id,'buyer',b.name,left(trim(p_body),3000),i.id,p_page);
end $$;

revoke all on function kalling_private.dataroom_tier(uuid,uuid),kalling_private.dataroom_label(uuid,uuid),kalling_private.dataroom_open(uuid,text),kalling_private.dataroom_owner_log(uuid,timestamptz),kalling_private.dataroom_summary(uuid) from public,anon,authenticated;
grant execute on function kalling_private.dataroom_ticket_ok(text) to authenticated;
revoke all on function public.kalling_dataroom_save_item(jsonb),public.kalling_dataroom_remove_item(uuid),public.kalling_dataroom_set_status(uuid,text),public.kalling_dataroom_grant_loi(uuid,uuid,text),public.kalling_dataroom_advisor(uuid),public.kalling_dataroom_owner_decide(uuid[],text,text),public.kalling_dataroom_weekly(uuid,boolean),public.kalling_dataroom_owner(),public.kalling_dataroom_buyer(uuid),public.kalling_dataroom_open(uuid),public.kalling_dataroom_download(uuid),public.kalling_dataroom_events(uuid,jsonb),public.kalling_dataroom_history(),public.kalling_dataroom_ask(uuid,integer,text) from public,anon;
grant execute on function public.kalling_dataroom_save_item(jsonb),public.kalling_dataroom_remove_item(uuid),public.kalling_dataroom_set_status(uuid,text),public.kalling_dataroom_grant_loi(uuid,uuid,text),public.kalling_dataroom_advisor(uuid),public.kalling_dataroom_owner_decide(uuid[],text,text),public.kalling_dataroom_weekly(uuid,boolean),public.kalling_dataroom_owner(),public.kalling_dataroom_buyer(uuid),public.kalling_dataroom_open(uuid),public.kalling_dataroom_download(uuid),public.kalling_dataroom_events(uuid,jsonb),public.kalling_dataroom_history(),public.kalling_dataroom_ask(uuid,integer,text) to authenticated;
commit;
