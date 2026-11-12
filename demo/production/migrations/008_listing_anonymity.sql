-- Kalling: stronger anonymity checks when a listing is published. Apply after 005.
-- The browser runs the full checker (lib/anonymity.ts). The database repeats the rules that must
-- never be bypassed: business name and its distinctive words, owner name, town names, website,
-- phone numbers and email addresses. tests/fixtures/anonymity-cases.json keeps both in step.
begin;

alter table public.kalling_listing_private add column owner_name text not null default '' check(length(owner_name)<=120);

create function kalling_private.word_in(p_text text,p_word text) returns boolean language sql immutable set search_path='' as $$
 select length(coalesce(p_word,''))>=3 and lower(coalesce(p_text,'')) ~ ('(^|[^a-z0-9])'||regexp_replace(lower(p_word),'([.*+?^${}()|\[\]\\])','\\\1','g')||'(''s|’s)?($|[^a-z0-9])')
$$;
create function kalling_private.anonymity_problems(p_text text,p_business text,p_city text,p_website text,p_owner text) returns text[] language plpgsql immutable set search_path='' as $$
declare out text[]='{}'; t text=lower(coalesce(p_text,'')); base text; w text; dom text; begin
 base=trim(regexp_replace(regexp_replace(coalesce(p_business,''),'[,.]?\s*\m(inc|llc|co|corp|corporation|company|ltd)\.?$','','i'),'\s*&\s*co\.?$','','i'));
 if length(base)>=4 and kalling_private.word_in(t,base) then out=out||lower(base); end if;
 foreach w in array regexp_split_to_array(base,'[^A-Za-z0-9'']+') loop
  w=regexp_replace(lower(w),'''s$','');
  if length(w)>=4 and not (w = any(array['the','and','of','heating','air','cooling','hvac','mechanical','services','service','plumbing','refrigeration','comfort','climate','systems','conditioning','company','co','inc','llc','corp','corporation','group','home','pro','pros','energy','solutions','contractors','contracting','family','brothers','sons','garden','state','north','south','east','west','jersey','new','york','central','shore','island','valley','business','contractor','contractors','repair','installation','residential','commercial','county','metro','express','quality','best','american','premier','care','total','tech','technical','experts','supply','mechanicals','enterprises','associates','holdings'])) and kalling_private.word_in(t,w) then out=out||w; end if;
 end loop;
 if length(trim(coalesce(p_owner,'')))>=3 then
  if kalling_private.word_in(t,trim(p_owner)) then out=out||lower(trim(p_owner)); end if;
  w=lower((regexp_split_to_array(trim(p_owner),'\s+'))[array_length(regexp_split_to_array(trim(p_owner),'\s+'),1)]);
  if length(w)>=3 and kalling_private.word_in(t,w) then out=out||w; end if;
 end if;
 foreach w in array array[lower(trim(coalesce(p_city,'')))]||array['newark','jersey city','paterson','clifton','hackensack','montclair','morristown','parsippany','paramus','bayonne','hoboken','elizabeth','livingston','fort lee','teaneck','wayne','edison','new brunswick','piscataway','woodbridge','somerville','bridgewater','princeton','trenton','hamilton','sayreville','old bridge','east brunswick','plainfield','westfield','green brook','flemington','camden','cherry hill','vineland','voorhees','mount laurel','moorestown','glassboro','millville','pennsauken','deptford','toms river','asbury park','long branch','red bank','point pleasant','freehold','manasquan','atlantic city','ocean city','belmar','manhattan','brooklyn','queens','bronx','staten island','astoria','flushing','harlem','williamsburg','hempstead','huntington','babylon','islip','garden city','massapequa','levittown','hicksville','smithtown','riverhead','southampton','patchogue','poughkeepsie','newburgh','kingston','middletown','new paltz','fishkill','peekskill','white plains','yonkers','new rochelle','mount vernon','scarsdale','nyack','new city','spring valley','tarrytown','ossining'] loop
  if length(w)>=4 and kalling_private.word_in(t,w) then out=out||w; end if;
 end loop;
 dom=split_part(regexp_replace(lower(trim(coalesce(p_website,''))),'^https?://(www[.])?',''),'/',1);
 if length(dom)>=4 and position(dom in t)>0 then out=out||dom; end if;
 if t ~ '(\+?1[ .-]?)?\(?\m[0-9]{3}\)?[ .-]?[0-9]{3}[ .-][0-9]{4}\M' then out=out||'a phone number'::text; end if;
 if t ~ '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}' then out=out||'an email address'::text; end if;
 return (select coalesce(array_agg(distinct x),'{}') from unnest(out) x);
end $$;

create or replace function public.kalling_listing_save(p jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare l uuid=nullif(p->>'id','')::uuid; c jsonb=coalesce(p->'confidential','{}'); begin
 perform kalling_private.need_advisor();
 if l is null then
  insert into public.kalling_listings(number,region,focus) values('KL-'||nextval('kalling_private.listing_number'),coalesce(p->>'region','Central Jersey'),coalesce(p->>'focus','Residential service & replacement')) returning id into l;
  insert into public.kalling_listing_private(listing_id) values(l);
 elsif (select sample from public.kalling_listings where id=l) then raise exception 'Sample listings cannot be edited.'; end if;
 update public.kalling_listings set headline=left(coalesce(p->>'headline',headline),120),region=coalesce(p->>'region',region),focus=coalesce(p->>'focus',focus),
  asking_price=coalesce((p->>'askingPrice')::bigint,asking_price),revenue=coalesce((p->>'revenue')::bigint,revenue),sde=coalesce((p->>'sde')::bigint,sde),established=coalesce((p->>'established')::int,established),
  employees=coalesce((p->>'employees')::int,employees),technicians=coalesce((p->>'technicians')::int,technicians),agreements=coalesce((p->>'agreements')::int,agreements),
  recurring_pct=coalesce((p->>'recurringPct')::int,recurring_pct),residential_pct=coalesce((p->>'residentialPct')::int,residential_pct),vehicles=coalesce((p->>'vehicles')::int,vehicles),
  real_estate=coalesce(p->>'realEstate',real_estate),seller_financing=coalesce((p->>'sellerFinancing')::boolean,seller_financing),reason=left(coalesce(p->>'reason',reason),300),summary=left(coalesce(p->>'summary',summary),2500),
  highlights=coalesce((select array_agg(left(x,200)) from jsonb_array_elements_text(p->'highlights') x where trim(x)<>''),case when p ? 'highlights' then '{}' else highlights end),
  growth=coalesce((select array_agg(left(x,200)) from jsonb_array_elements_text(p->'growth') x where trim(x)<>''),case when p ? 'growth' then '{}' else growth end),updated_at=now() where id=l;
 update public.kalling_listing_private set business_name=left(coalesce(c->>'businessName',business_name),160),city=left(coalesce(c->>'city',city),120),website=left(coalesce(c->>'website',website),200),details=left(coalesce(c->>'details',details),5000),
  owner_name=left(coalesce(c->>'ownerName',owner_name),120),company_id=coalesce(p->>'companyId',company_id) where listing_id=l;
 return l;
end $$;

create or replace function public.kalling_listing_set_status(p_listing uuid,p_status text) returns void language plpgsql security definer set search_path='' as $$
declare l public.kalling_listings; s public.kalling_listing_private; problems text[]; begin
 perform kalling_private.need_advisor();
 select * into l from public.kalling_listings where id=p_listing for update;select * into s from public.kalling_listing_private where listing_id=p_listing;
 if p_status='Live' then
  if length(l.headline)<12 or length(l.summary)<120 or l.asking_price<=0 or l.revenue<=0 or l.sde<=0 or cardinality(l.highlights)<3 then raise exception 'Complete the headline, a 120-character summary, price, revenue, SDE and three highlights before publishing.'; end if;
  problems=kalling_private.anonymity_problems(l.headline||' '||l.summary||' '||l.reason||' '||array_to_string(l.highlights,' ')||' '||array_to_string(l.growth,' '),s.business_name,s.city,s.website,s.owner_name);
  if cardinality(problems)>0 then raise exception 'The public text mentions “%”. Remove it so the business stays anonymous.',problems[1]; end if;
 end if;
 update public.kalling_listings set status=p_status,published_at=case when p_status='Live' then coalesce(published_at,now()) else published_at end,updated_at=now() where id=p_listing;
end $$;

revoke all on function kalling_private.word_in(text,text),kalling_private.anonymity_problems(text,text,text,text,text) from public,anon,authenticated;
commit;
