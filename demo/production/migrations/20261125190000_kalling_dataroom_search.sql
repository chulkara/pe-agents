-- Search indexed passages from currently visible data-room items. File access still uses the
-- existing logged open ticket, and owners receive only a weekly search count.
begin;

create table public.kalling_dataroom_searches (
 listing_id uuid not null references public.kalling_dataroom_rooms(listing_id) on delete cascade,
 buyer_id uuid not null references public.kalling_buyers(id) on delete cascade,
 question text not null check (char_length(question) between 2 and 3000),
 at timestamptz not null default clock_timestamp()
);
create index dataroom_searches_buyer_at on public.kalling_dataroom_searches(buyer_id,at desc);
create index dataroom_searches_listing_at on public.kalling_dataroom_searches(listing_id,at desc);
alter table public.kalling_dataroom_searches enable row level security;
revoke all on public.kalling_dataroom_searches from public,anon,authenticated;
grant select on public.kalling_dataroom_searches to authenticated;

create function kalling_private.dataroom_search_firm(p_listing uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(
  select 1 from public.kalling_dataroom_rooms r
  join public.kalling_portals p on p.id=r.portal_id
  where r.listing_id=p_listing and p.firm_id=kalling_private.house()
    and kalling_private.portal_role(p.id) in ('firm-write','firm-read')
 )
$$;
revoke all on function kalling_private.dataroom_search_firm(uuid) from public,anon,authenticated;
grant execute on function kalling_private.dataroom_search_firm(uuid) to authenticated;

create policy dataroom_searches_read on public.kalling_dataroom_searches for select to authenticated
 using (buyer_id=(select (kalling_private.my_buyer()).id) or kalling_private.dataroom_search_firm(listing_id));

-- Normalize HVAC vocabulary for ranking, while leaving the original text in each returned quote.
create function kalling_private.dataroom_search_terms(p_text text) returns text
language sql immutable strict set search_path='' as $$
 select regexp_replace(regexp_replace(regexp_replace(regexp_replace(lower(p_text),
  '\m(maintenance[[:space:]-]+(plans?|contracts?)|service[[:space:]-]+(plans?|contracts?|agreements?))\M','maintenance agreement','g'),
  '\m(ac|a/c|air[[:space:]-]+conditioning)\M','airconditioning','g'),
  '\m(preventative|preventive)\M','preventive','g'),
  '\mrenewals?\M','renew','g')
$$;

create function kalling_private.dataroom_search_results(
 p_listing uuid,p_question text,p_buyer uuid,p_firm boolean
) returns jsonb language sql stable set search_path='' as $$
 with viewer as materialized (
  select kalling_private.dataroom_tier(p_listing,p_buyer) as tier,
   p_firm and kalling_private.dataroom_search_firm(p_listing) as firm
 ), allowed_items as materialized (
  select i.id,i.display_name,i.file_id,i.portal_id
  from public.kalling_dataroom_items i
  join public.kalling_dataroom_rooms r on r.listing_id=i.listing_id and r.portal_id=i.portal_id
  join public.kalling_portals p on p.id=r.portal_id and p.firm_id=kalling_private.house()
  join public.kalling_portal_files f on f.id=i.file_id and f.portal_id=i.portal_id and f.status='stored'
  cross join viewer v
  where i.listing_id=p_listing and
   ((v.firm and i.owner_status<>'Removed') or (not p_firm and kalling_private.dataroom_visible(i,v.tier)))
 ), search_query as materialized (
  select websearch_to_tsquery('english',kalling_private.dataroom_search_terms(
   regexp_replace(p_question,'\m(many|much|please|show|tell)\M',' ','gi')
  )) as q
 ), authorized_pages as materialized (
  select i.id as item_id,i.display_name,entry.page,entry.text
  from allowed_items i
  join public.kalling_portal_file_text x on x.file_id=i.file_id and x.portal_id=i.portal_id and x.status='ok'
  cross join lateral jsonb_array_elements(x.pages) e(value)
  cross join lateral (
   select case when e.value->>'page' ~ '^[1-9][0-9]{0,3}$' then (e.value->>'page')::integer end as page,
    case when jsonb_typeof(e.value->'text')='string' then e.value->>'text' end as text
  ) entry
  where entry.page between 1 and 5000 and entry.text is not null
 ), matched_pages as materialized (
  select p.* from authorized_pages p cross join search_query
  where numnode(q)>0 and querytree(q)<>'T'
   and to_tsvector('english',kalling_private.dataroom_search_terms(p.text)) @@ q
 ), scored as (
  select m.item_id,m.display_name,m.page,fragments.quote,fragments.score
  from matched_pages m
  cross join search_query
  cross join lateral (
   -- Zero-width boundaries preserve the exact whitespace between consecutive sentences.
   select quote,ts_rank_cd(vector,q) as score
   from (
    select sentence,lead(sentence,1) over (order by position) as next,
      lead(sentence,2) over (order by position) as third
    from regexp_split_to_table(m.text,E'(?<=[.!?])(?=[[:space:]]|$)|(?<=\\n)(?=[^[:space:]])')
     with ordinality as sections(sentence,position)
   ) s
   cross join lateral (values (s.sentence),(s.sentence||s.next),(s.sentence||s.next||s.third)) spans(text)
   -- Long sentences use overlapping windows so a hit near the end still has context.
   cross join lateral generate_series(1,char_length(spans.text),450) offsets(start_at)
   cross join lateral (
    select btrim(substr(spans.text,greatest(1,least(start_at,char_length(spans.text)-599)),600),
     E' \\t\\r\\n') as quote
   ) fragment
   cross join lateral (
    select to_tsvector('english',kalling_private.dataroom_search_terms(quote)) as vector
   ) evidence
   where vector @@ q
   order by score desc,char_length(quote),quote
   limit 1
  ) fragments
  where fragments.score>0
 ), best_per_page as (
  select distinct on (item_id,page) item_id,display_name,page,quote,score
  from scored
  order by item_id,page,score desc,char_length(quote),quote
 )
 select coalesce(jsonb_agg(to_jsonb(result) order by score desc,item_id,page),'[]'::jsonb)
 from (
  select * from best_per_page
  order by score desc,item_id,page
  limit 5
 ) result
$$;

create function kalling_private.dataroom_search_question(p_question text) returns text
language plpgsql immutable set search_path='' as $$
declare q text;
begin
 if p_question is null or char_length(p_question)>3000 then
  raise exception 'Write a question between 2 and 3000 characters.' using errcode='22023';
 end if;
 q=regexp_replace(p_question,'^[[:space:]]+|[[:space:]]+$','','g');
 if char_length(q)<2 then
  raise exception 'Write a question between 2 and 3000 characters.' using errcode='22023';
 end if;
 return q;
end
$$;

create function public.kalling_dataroom_search(p_listing uuid,p_question text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 b uuid=(kalling_private.my_buyer()).id;
 q text;
 searched_at timestamptz;
begin
 if b is null then
  if not kalling_private.dataroom_search_firm(p_listing) then return '[]'; end if;
  return kalling_private.dataroom_search_results(p_listing,kalling_private.dataroom_search_question(p_question),null,true);
 end if;
 if kalling_private.dataroom_tier(p_listing,b)=0 then return '[]'; end if;

 q=kalling_private.dataroom_search_question(p_question);
 -- Serialize the count and insert for this buyer across all listings. The volatile
 -- function reads committed events after acquiring the transaction-scoped lock.
 perform pg_advisory_xact_lock(hashtextextended(b::text,453219));
 if kalling_private.dataroom_tier(p_listing,b)=0 then return '[]'; end if;
 searched_at=clock_timestamp();
 if (select count(*) from public.kalling_dataroom_searches s
     where s.buyer_id=b and s.at>searched_at-interval '1 hour')>=30 then
  raise exception 'You’ve asked 30 questions in the past hour. Wait a little and try again.';
 end if;
 insert into public.kalling_dataroom_searches(listing_id,buyer_id,question,at)
 values(p_listing,b,q,searched_at);
 return kalling_private.dataroom_search_results(p_listing,q,b,false);
end
$$;

-- Explicit firm lane for staff who also have a buyer profile. The listing RPC above
-- always applies buyer-tier permissions when that profile exists.
create function public.kalling_dataroom_search_advisor(p_listing uuid,p_question text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not kalling_private.dataroom_search_firm(p_listing) then
  raise exception 'Only this data room’s firm can search as an advisor.' using errcode='42501';
 end if;
 return kalling_private.dataroom_search_results(p_listing,kalling_private.dataroom_search_question(p_question),null,true);
end
$$;

create function kalling_private.dataroom_search_count(p_listing uuid) returns bigint
language sql stable set search_path='' as $$
 select count(*) from public.kalling_dataroom_searches s
 where s.listing_id=p_listing and s.at>=now()-interval '7 days'
$$;

create function public.kalling_dataroom_search_activity(p_listing uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not kalling_private.dataroom_search_firm(p_listing) then
  raise exception 'Only this data room’s firm can see buyer questions.' using errcode='42501';
 end if;
 return jsonb_build_object(
  'search_question_count',kalling_private.dataroom_search_count(p_listing),
  'searches',coalesce((select jsonb_agg(to_jsonb(recent) order by at desc) from (
   select s.question,s.at from public.kalling_dataroom_searches s
   where s.listing_id=p_listing order by s.at desc limit 100
  ) recent),'[]'::jsonb)
 );
end
$$;

create or replace function kalling_private.dataroom_summary(p_listing uuid) returns text
language sql stable security definer set search_path='' as $$
 select case when l='[]' and questions=0 then 'No buyer opened a document in the data room this week.'
  else 'Data room this week:'||coalesce((
   select string_agg(chr(10)||(d->>'item')||': '||(
    select string_agg((e->>'label')||' ('||(e->>'opens')||' open'
     ||case when (e->>'opens')='1' then '' else 's' end
     ||case when (e->>'downloaded')::boolean then ', downloaded' else '' end||')','; ')
    from jsonb_array_elements(d->'entries') e),'')
   from jsonb_array_elements(l) d),'')
   ||case when questions=0 then '' else chr(10)||questions
      ||case when questions=1 then ' question asked' else ' questions asked' end end
  end
 from (select kalling_private.dataroom_owner_log(p_listing,now()-interval '7 days') l,
   kalling_private.dataroom_search_count(p_listing) questions) s
$$;

-- Return an opaque revision for the authorized items to let the viewer discard stale quotes.
-- The item list and its permissions are unchanged. View-only opens still use logged tickets.
create or replace function public.kalling_dataroom_buyer(p_listing uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 with viewer as materialized (
  select coalesce(kalling_private.dataroom_tier(p_listing,(kalling_private.my_buyer()).id),0) tier
 ), items as materialized (
  select i.id,i.file_id,i.portal_id,i.display_name,i.folder,i.tier,i.allow_download,i.note,
   f.mime,i.changed_at,i.approved_at,kalling_private.dataroom_visible(i,v.tier) as open
  from public.kalling_dataroom_items i
  join public.kalling_portal_files f on f.id=i.file_id
  cross join viewer v
  where i.listing_id=p_listing and i.owner_status='Approved' and v.tier>0
 )
 select jsonb_build_object(
  'tier',viewer.tier,
  'items',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,
   'display_name',i.display_name,'folder',i.folder,'tier',i.tier,'mime',i.mime,
   'allow_download',i.allow_download,'note',i.note,'open',i.open)
   order by i.folder,i.display_name) from items i),'[]'::jsonb),
  'revision',(select md5(coalesce(string_agg(
   jsonb_build_array(i.id,i.file_id,i.changed_at,i.approved_at,x.text_hash,x.extracted_at,x.status)::text,
   ',' order by i.id),'')) from items i left join public.kalling_portal_file_text x
   on x.file_id=i.file_id and x.portal_id=i.portal_id where i.open)
 ) from viewer
$$;

revoke all on function kalling_private.dataroom_search_terms(text),
 kalling_private.dataroom_search_results(uuid,text,uuid,boolean),
 kalling_private.dataroom_search_question(text),kalling_private.dataroom_search_count(uuid)
 from public,anon,authenticated;
revoke all on function public.kalling_dataroom_search(uuid,text),
 public.kalling_dataroom_search_advisor(uuid,text),public.kalling_dataroom_search_activity(uuid)
 from public,anon,authenticated;
grant execute on function public.kalling_dataroom_search(uuid,text),
 public.kalling_dataroom_search_advisor(uuid,text),public.kalling_dataroom_search_activity(uuid)
 to authenticated;

commit;
