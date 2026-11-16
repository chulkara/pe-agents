-- Administrative preparation for the six existing fictional acceptance users.
-- Preserves the completed buyer fixture and the paused private brokerage.
-- No Auth users, credentials, outgoing messages, paid calls or real listings.
begin;
do $fixture$
declare a public.kalling_firms;b public.kalling_firms;w public.kalling_workspaces;
 owner_id uuid;other_owner uuid;buyer_id uuid;specialist_id uuid;base uuid;
 run uuid=gen_random_uuid();company text;listing uuid;sample_number integer=920016;
 prior public.kalling_listings;prior_company text;
begin
 if (select count(*) from auth.users where email in ('owner-a-20261114@kalling-validation.invalid','owner-b-20261114@kalling-validation.invalid','member-20261114@kalling-validation.invalid','seller-20261114@kalling-validation.invalid','buyer-20261114@kalling-validation.invalid','specialist-20261114@kalling-validation.invalid') and email_confirmed_at is not null)<>6 then raise exception 'All six existing fictional accounts must be confirmed.';end if;
 select id into owner_id from auth.users where email='owner-a-20261114@kalling-validation.invalid';
 select id into other_owner from auth.users where email='owner-b-20261114@kalling-validation.invalid';
 select id into buyer_id from auth.users where email='buyer-20261114@kalling-validation.invalid';
 select id into specialist_id from auth.users where email='specialist-20261114@kalling-validation.invalid';
 if (select count(*) from public.kalling_firms where created_by=owner_id and name like 'Fictional hosted validation A %')<>1 or (select count(*) from public.kalling_firms where created_by=other_owner and name like 'Fictional hosted validation B %')<>1 then raise exception 'The two fictional foundation firms must be unambiguous.';end if;
 select * into a from public.kalling_firms where created_by=owner_id and name like 'Fictional hosted validation A %';
 select * into b from public.kalling_firms where created_by=other_owner and name like 'Fictional hosted validation B %';
 base=replace(a.name,'Fictional hosted validation A ','')::uuid;
 if b.name<>'Fictional hosted validation B '||base::text then raise exception 'The foundation firms do not belong to the same acceptance run.';end if;
 if not exists(select 1 from kalling_private.brokerage_settings s where s.firm_id=a.id and not s.intake_open and s.pilot_buyers @> array[buyer_id,specialist_id] and cardinality(s.pilot_buyers)=2) then raise exception 'Preserve the configured fictional brokerage with public intake closed and only the original two pilot buyers.';end if;
 if exists(select 1 from public.kalling_leads) or exists(select 1 from public.kalling_listings where not sample) or exists(select 1 from kalling_private.alert_outbox) then raise exception 'This preparation refuses real marketplace data or outbound drafts.';end if;
 if exists(select 1 from public.kalling_buyers where user_id not in (buyer_id,specialist_id) or name not like 'Fictional %') or not exists(select 1 from public.kalling_buyers where user_id=buyer_id and name='Fictional Acceptance Buyer' and status='Restricted') then raise exception 'The completed buyer test must leave only fictional profiles and its main buyer restricted.';end if;
 select l.* into prior from public.kalling_listings l join public.kalling_listing_private p on p.listing_id=l.id where l.sample and l.headline='Sample HVAC company for software validation' and p.company_id like 'fictional-buyer-access-%' and p.business_name='Fictional HVAC buyer access validation' order by l.created_at desc limit 1;
 select p.company_id into prior_company from public.kalling_listing_private p where p.listing_id=prior.id;
 if prior.id is null or prior.status<>'Withdrawn' or not exists(select 1 from public.kalling_portals p where p.company_id=prior_company and p.firm_id=a.id and p.status='Closed') or exists(select 1 from public.kalling_portals p where p.company_id=prior_company and p.status='Active') or exists(select 1 from public.kalling_dataroom_rooms r where r.listing_id=prior.id and r.status<>'Unpublished') then raise exception 'The preceding fictional buyer listing, portal and data room must be closed.';end if;
 if exists(select 1 from public.kalling_listing_private p join public.kalling_listings l on l.id=p.listing_id where p.company_id like 'fictional-handover-%' and l.status<>'Sold') then raise exception 'A prepared or incomplete handover fixture already exists. Preserve it and review its manifest before preparing another.';end if;
 select * into w from public.kalling_workspaces where firm_id=a.id for update;
 if w.data#>>'{firm,name}' is distinct from a.name or jsonb_typeof(w.data->'companies') is distinct from 'array' or exists(select 1 from jsonb_array_elements(w.data->'companies') c where (c->>'sample') is distinct from 'true') then raise exception 'The foundation workspace must contain only fictional sample companies.';end if;
 company='fictional-handover-'||run::text;
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 perform public.kalling_save_workspace(a.id,w.version,jsonb_set(w.data,'{companies}',(w.data->'companies')||jsonb_build_array(jsonb_build_object('id',company,'name','Fictional HVAC handover validation','sample',true))),'Prepared private fictional closing-file acceptance');
 while exists(select 1 from public.kalling_listings where number='KL-'||sample_number::text) loop sample_number=sample_number+1;end loop;
 insert into public.kalling_listings(number,status,sample,headline,region,focus,asking_price,revenue,sde,summary,highlights,published_at)
 values('KL-'||sample_number::text,'Live',true,'Sample HVAC closing-file validation','Central Jersey','Commercial HVAC/R',2800000,3000000,500000,
 'Sample listing for software validation only. This fictional HVAC company tests controlled closing-file handover. No real business, acquisition, funding or professional review is represented.',
 array['Fictional software validation only','Sample amounts and documents','No real business is offered'],now()) returning id into listing;
 insert into public.kalling_listing_private(listing_id,business_name,owner_name,company_id) values(listing,'Fictional HVAC handover validation','Fictional Seller',company);
end $fixture$;
commit;
select json_build_object('project','https://ymbciapnzdmymtthevjp.supabase.co','mode','handover','status','prepared',
 'fixture',replace(p.company_id,'fictional-handover-',''),'firm',s.firm_id,'otherFirm',b.id,'company',p.company_id,
 'listing',l.id,'listingNumber',l.number,'expectedHeadline',l.headline,
 'priorBuyerFixture',replace(old.company_id,'fictional-buyer-access-',''),'priorBuyerListing',old.listing_id) as handover_fixture
from kalling_private.brokerage_settings s join public.kalling_firms a on a.id=s.firm_id
join public.kalling_firms b on b.name='Fictional hosted validation B '||replace(a.name,'Fictional hosted validation A ','') and b.created_by=(select id from auth.users where email='owner-b-20261114@kalling-validation.invalid')
join public.kalling_listing_private p on p.company_id like 'fictional-handover-%' and p.business_name='Fictional HVAC handover validation'
join public.kalling_listings l on l.id=p.listing_id
join lateral(select x.company_id,x.listing_id from public.kalling_listing_private x join public.kalling_listings y on y.id=x.listing_id where x.company_id like 'fictional-buyer-access-%' and y.headline='Sample HVAC company for software validation' and y.sample and y.status='Withdrawn' order by y.created_at desc limit 1) old on true
where not s.intake_open and l.sample and l.status='Live' and l.headline='Sample HVAC closing-file validation'
order by l.created_at desc limit 1;
