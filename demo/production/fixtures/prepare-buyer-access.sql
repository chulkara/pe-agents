-- Administrative provisioning for the existing fictional acceptance accounts.
-- Refuses real marketplace data or a configured broker. No emails, model calls,
-- account changes or privileged client keys. Public registration stays closed.
begin;
do $fixture$
declare a public.kalling_firms;b public.kalling_firms;w public.kalling_workspaces;
 owner_id uuid;other_owner uuid;buyer_id uuid;other_buyer uuid;base uuid;run uuid=gen_random_uuid();company text;listing uuid;sample_number integer=910015;
begin
 if exists(select 1 from kalling_private.brokerage_settings) then raise exception 'A brokerage is already configured. Do not replace it for this fixture.';end if;
 if exists(select 1 from public.kalling_leads) or exists(select 1 from public.kalling_buyers) or exists(select 1 from public.kalling_access) or exists(select 1 from public.kalling_listings where not sample) then raise exception 'This fixture requires an unused fictional marketplace. Preserve existing data and review setup separately.';end if;
 if (select count(*) from auth.users where email in ('owner-a-20261114@kalling-validation.invalid','owner-b-20261114@kalling-validation.invalid','member-20261114@kalling-validation.invalid','seller-20261114@kalling-validation.invalid','buyer-20261114@kalling-validation.invalid','specialist-20261114@kalling-validation.invalid') and email_confirmed_at is not null)<>6 then raise exception 'All six existing fictional accounts must be confirmed.';end if;
 select id into owner_id from auth.users where email='owner-a-20261114@kalling-validation.invalid';
 select id into other_owner from auth.users where email='owner-b-20261114@kalling-validation.invalid';
 select id into buyer_id from auth.users where email='buyer-20261114@kalling-validation.invalid';
 select id into other_buyer from auth.users where email='specialist-20261114@kalling-validation.invalid';
 if (select count(*) from public.kalling_firms where created_by=owner_id and name like 'Fictional hosted validation A %')<>1 or (select count(*) from public.kalling_firms where created_by=other_owner and name like 'Fictional hosted validation B %')<>1 then raise exception 'The two fictional foundation firms must be unambiguous.';end if;
 select * into a from public.kalling_firms where created_by=owner_id and name like 'Fictional hosted validation A %';
 select * into b from public.kalling_firms where created_by=other_owner and name like 'Fictional hosted validation B %';
 base=replace(a.name,'Fictional hosted validation A ','')::uuid;
 if b.name<>'Fictional hosted validation B '||base::text then raise exception 'The foundation firms do not belong to the same acceptance run.';end if;
 select * into w from public.kalling_workspaces where firm_id=a.id for update;
 if w.data#>>'{firm,name}' is distinct from a.name or jsonb_typeof(w.data->'companies') is distinct from 'array' or exists(select 1 from jsonb_array_elements(w.data->'companies') c where (c->>'sample') is distinct from 'true') then raise exception 'The foundation workspace must contain only fictional sample companies.';end if;
 company='fictional-buyer-access-'||run::text;
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 perform public.kalling_save_workspace(a.id,w.version,jsonb_set(w.data,'{companies}',(w.data->'companies')||jsonb_build_array(jsonb_build_object('id',company,'name','Fictional HVAC buyer access validation','sample',true))),'Prepared private fictional buyer acceptance');
 insert into kalling_private.brokerage_settings(firm_id,intake_open,pilot_buyers) values(a.id,false,array[buyer_id,other_buyer]);
 while exists(select 1 from public.kalling_listings where public.kalling_listings.number='KL-'||sample_number::text) loop sample_number=sample_number+1;end loop;
 insert into public.kalling_listings(number,status,sample,headline,region,focus,asking_price,revenue,sde,summary,highlights,published_at)
 values('KL-'||sample_number::text,'Live',true,'Sample HVAC company for software validation','Central Jersey','Residential service & replacement',1200000,2000000,300000,
 'Sample listing for software validation only. This fictional HVAC company is used to check buyer verification, confidentiality approvals and document permissions. No business is offered for sale through this sample.',
 array['Fictional company for software validation','Sample figures only','No real business is represented'],now()) returning id into listing;
 insert into public.kalling_listing_private(listing_id,business_name,owner_name,company_id) values(listing,'Fictional HVAC buyer access validation','Fictional Seller',company);
 if (select intake_open from kalling_private.brokerage_settings where id) or exists(select 1 from kalling_private.alert_outbox) then raise exception 'Public intake and outbound delivery must remain disabled.';end if;
end $fixture$;
commit;
select json_build_object('project','https://ymbciapnzdmymtthevjp.supabase.co','mode','buyer-access','status','prepared',
 'fixture',replace(p.company_id,'fictional-buyer-access-',''),'firm',s.firm_id,'otherFirm',b.id,'company',p.company_id,
 'listing',l.id,'listingNumber',l.number,'expectedHeadline',l.headline) as buyer_access_fixture
from kalling_private.brokerage_settings s join public.kalling_firms a on a.id=s.firm_id
join public.kalling_firms b on b.name='Fictional hosted validation B '||replace(a.name,'Fictional hosted validation A ','') and b.created_by=(select id from auth.users where email='owner-b-20261114@kalling-validation.invalid')
join public.kalling_listing_private p on p.company_id like 'fictional-buyer-access-%' and p.business_name='Fictional HVAC buyer access validation'
join public.kalling_listings l on l.id=p.listing_id
where not s.intake_open and l.sample and l.status='Live' and l.headline='Sample HVAC company for software validation'
order by l.created_at desc limit 1;
