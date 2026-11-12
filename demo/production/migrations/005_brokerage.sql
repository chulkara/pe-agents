-- Kalling brokerage marketplace. Apply once after 001-004 as postgres.
-- Public visitors read anonymized listings and can submit a seller inquiry. Buyers sign in,
-- keep a profile, sign a listing NDA and request access. Members of the "house" firm (the
-- brokerage itself) review leads, publish listings, approve buyers and manage offers.
begin;

create table kalling_private.brokerage_settings (id boolean primary key default true check(id), firm_id uuid not null references public.kalling_firms(id));
alter table kalling_private.brokerage_settings enable row level security;
revoke all on kalling_private.brokerage_settings from public,anon,authenticated;
create function kalling_private.house() returns uuid language sql stable security definer set search_path='' as $$ select firm_id from kalling_private.brokerage_settings where id $$;
create function kalling_private.advisor_role() returns text language sql stable security definer set search_path='' as $$ select kalling_private.role_for(kalling_private.house()) $$;
create function kalling_private.need_advisor() returns void language plpgsql security definer set search_path='' as $$
begin if auth.uid() is null or coalesce(kalling_private.advisor_role(),'') not in ('owner','admin','analyst') then raise exception 'Only a Kalling advisor can do this.' using errcode='42501'; end if; end $$;

create table public.kalling_leads (
 id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(),
 name text not null check(length(name) between 2 and 120), email text not null check(length(email)<=254), phone text not null default '' check(length(phone)<=40),
 business_name text not null default '' check(length(business_name)<=160), region text not null, timing text not null default '' check(length(timing)<=60),
 message text not null default '' check(length(message)<=2000), valuation jsonb check(valuation is null or octet_length(valuation::text)<=500),
 source text not null check(source in ('valuation','contact')),
 status text not null default 'New' check(status in ('New','Contacted','Qualified','Engaged','Not a fit')), notes text not null default '' check(length(notes)<=4000)
);
create index kalling_leads_recent on public.kalling_leads(created_at desc);
create sequence kalling_private.listing_number start 1041;
create table public.kalling_listings (
 id uuid primary key default gen_random_uuid(), number text not null unique, status text not null default 'Draft' check(status in ('Draft','Live','Under LOI','Sold','Withdrawn')),
 sample boolean not null default false, headline text not null default '' check(length(headline)<=120),
 region text not null check(region in ('North Jersey','Central Jersey','South Jersey','Jersey Shore','New York City','Long Island','Hudson Valley','Westchester & Rockland')),
 focus text not null check(focus in ('Residential service & replacement','Commercial HVAC/R','Residential & commercial','Refrigeration & controls')),
 asking_price bigint not null default 0 check(asking_price>=0), revenue bigint not null default 0 check(revenue>=0), sde bigint not null default 0 check(sde>=0),
 established integer not null default 2010, employees integer not null default 0, technicians integer not null default 0, agreements integer not null default 0,
 recurring_pct integer not null default 0 check(recurring_pct between 0 and 100), residential_pct integer not null default 100 check(residential_pct between 0 and 100), vehicles integer not null default 0,
 real_estate text not null default 'Leased facility' check(real_estate in ('Leased facility','Real estate available','Home-based')), seller_financing boolean not null default false,
 reason text not null default '' check(length(reason)<=300), summary text not null default '' check(length(summary)<=2500),
 highlights text[] not null default '{}', growth text[] not null default '{}',
 created_at timestamptz not null default now(), published_at timestamptz, updated_at timestamptz not null default now()
);
create table public.kalling_listing_private (
 listing_id uuid primary key references public.kalling_listings(id), business_name text not null default '', city text not null default '', website text not null default '', details text not null default '' check(length(details)<=5000), company_id text
);
create table public.kalling_buyers (
 id uuid primary key default gen_random_uuid(), user_id uuid not null unique references auth.users(id), email text not null,
 name text not null check(length(name) between 2 and 120), phone text not null default '', type text not null check(type in ('Owner-operator','Search fund','Strategic HVAC operator','Private equity / family office')),
 company text not null default '', funds text not null check(funds in ('Under $250K','$250K–$500K','$500K–$1M','$1M–$5M','Over $5M')), financing text[] not null default '{}',
 experience text not null check(length(experience) between 30 and 1500), regions text[] not null default '{}', max_price bigint not null default 0,
 status text not null default 'Registered' check(status in ('Registered','Verified','Restricted')), advisor_note text not null default '', saved uuid[] not null default '{}', alerts boolean not null default true,
 created_at timestamptz not null default now()
);
create table public.kalling_access (
 id uuid primary key default gen_random_uuid(), listing_id uuid not null references public.kalling_listings(id), buyer_id uuid not null references public.kalling_buyers(id),
 status text not null default 'Pending' check(status in ('Pending','Approved','Declined','Withdrawn')), nda jsonb not null, message text not null default '', decision_note text not null default '',
 decided_at timestamptz, decided_by uuid references auth.users(id), created_at timestamptz not null default now()
);
create unique index kalling_access_open on public.kalling_access(listing_id,buyer_id) where status in ('Pending','Approved');
create table public.kalling_offers (
 id uuid primary key default gen_random_uuid(), listing_id uuid not null references public.kalling_listings(id), buyer_id uuid not null references public.kalling_buyers(id),
 kind text not null check(kind in ('Indication of interest','Letter of intent')), price bigint not null check(price>0), cash_at_close bigint not null, seller_note bigint not null, earnout bigint not null,
 financing text not null default '', close_days integer not null check(close_days between 14 and 365), conditions text not null default '' check(length(conditions)<=2000),
 status text not null default 'Submitted' check(status in ('Submitted','Shared with seller','Countered','Accepted','Declined','Withdrawn')), advisor_note text not null default '',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check(abs(cash_at_close+seller_note+earnout-price)<=1)
);
create table public.kalling_listing_questions (
 id uuid primary key default gen_random_uuid(), listing_id uuid not null references public.kalling_listings(id), buyer_id uuid not null references public.kalling_buyers(id),
 side text not null check(side in ('buyer','advisor')), author text not null, body text not null check(length(body) between 2 and 3000), created_at timestamptz not null default now()
);

create function kalling_private.my_buyer() returns public.kalling_buyers language sql stable security definer set search_path='' as $$ select * from public.kalling_buyers where user_id=auth.uid() $$;
create function kalling_private.has_access(p_listing uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.kalling_access a join public.kalling_buyers b on b.id=a.buyer_id where a.listing_id=p_listing and a.status='Approved' and b.user_id=auth.uid() and b.status<>'Restricted')
$$;
alter table public.kalling_leads enable row level security;
alter table public.kalling_listings enable row level security;
alter table public.kalling_listing_private enable row level security;
alter table public.kalling_buyers enable row level security;
alter table public.kalling_access enable row level security;
alter table public.kalling_offers enable row level security;
alter table public.kalling_listing_questions enable row level security;
create policy leads_read on public.kalling_leads for select to authenticated using(kalling_private.advisor_role() is not null);
create policy listings_public on public.kalling_listings for select to anon,authenticated using(status in ('Live','Under LOI','Sold') or kalling_private.advisor_role() is not null);
create policy listing_private_read on public.kalling_listing_private for select to authenticated using(kalling_private.advisor_role() is not null or kalling_private.has_access(listing_id));
create policy buyers_read on public.kalling_buyers for select to authenticated using(user_id=auth.uid() or kalling_private.advisor_role() is not null);
create policy access_read on public.kalling_access for select to authenticated using(buyer_id=(kalling_private.my_buyer()).id or kalling_private.advisor_role() is not null);
create policy offers_read on public.kalling_offers for select to authenticated using(buyer_id=(kalling_private.my_buyer()).id or kalling_private.advisor_role() is not null);
create policy questions_read on public.kalling_listing_questions for select to authenticated using(buyer_id=(kalling_private.my_buyer()).id or kalling_private.advisor_role() is not null);
revoke all on public.kalling_leads,public.kalling_listings,public.kalling_listing_private,public.kalling_buyers,public.kalling_access,public.kalling_offers,public.kalling_listing_questions from public,anon,authenticated;
grant select on public.kalling_listings to anon,authenticated;
grant select on public.kalling_leads,public.kalling_listing_private,public.kalling_buyers,public.kalling_access,public.kalling_offers,public.kalling_listing_questions to authenticated;

-- ── Public ───────────────────────────────────────────────────────────────────────────
create function public.kalling_submit_lead(p jsonb) returns void language plpgsql security definer set search_path='' as $$
declare e text=lower(trim(coalesce(p->>'email',''))); begin
 if kalling_private.house() is null then raise exception 'Seller inquiries are not open yet. Please email us instead.'; end if;
 if coalesce((p->>'consent')::boolean,false) is not true then raise exception 'Please agree to be contacted about your business.'; end if;
 if e!~'^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' or length(e)>254 then raise exception 'Enter a valid email address.'; end if;
 if length(trim(coalesce(p->>'name','')))<2 then raise exception 'Enter your name.'; end if;
 if (select count(*) from public.kalling_leads where email=e and created_at>now()-interval '1 day')>=3 then raise exception 'We already have your request. An advisor will be in touch within one business day.'; end if;
 if (select count(*) from public.kalling_leads where created_at>now()-interval '1 hour')>=60 then raise exception 'We are receiving many requests. Please try again in an hour.'; end if;
 insert into public.kalling_leads(name,email,phone,business_name,region,timing,message,valuation,source)
  values(left(trim(p->>'name'),120),e,left(coalesce(p->>'phone',''),40),left(coalesce(p->>'businessName',''),160),
   case when p->>'region' in ('North Jersey','Central Jersey','South Jersey','Jersey Shore','New York City','Long Island','Hudson Valley','Westchester & Rockland') then p->>'region' else null end,
   left(coalesce(p->>'timing',''),60),left(coalesce(p->>'message',''),2000),case when jsonb_typeof(p->'valuation')='object' then p->'valuation' end,case when p->>'source'='contact' then 'contact' else 'valuation' end);
exception when not_null_violation then raise exception 'Choose where the business is based.';
end $$;

-- ── Advisors ─────────────────────────────────────────────────────────────────────────
create function public.kalling_brokerage_set_house(p_firm uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if kalling_private.role_for(p_firm) is distinct from 'owner' then raise exception 'Only the firm owner can do this.' using errcode='42501'; end if;
 if kalling_private.house() is not null then raise exception 'The brokerage firm is already set.'; end if;
 insert into kalling_private.brokerage_settings(firm_id) values(p_firm);
end $$;
create function public.kalling_lead_update(p_lead uuid,p_status text,p_notes text) returns void language plpgsql security definer set search_path='' as $$
begin perform kalling_private.need_advisor();
 update public.kalling_leads set status=coalesce(p_status,status),notes=coalesce(left(p_notes,4000),notes) where id=p_lead; end $$;
create function public.kalling_listing_save(p jsonb) returns uuid language plpgsql security definer set search_path='' as $$
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
 update public.kalling_listing_private set business_name=left(coalesce(c->>'businessName',business_name),160),city=left(coalesce(c->>'city',city),120),website=left(coalesce(c->>'website',website),200),details=left(coalesce(c->>'details',details),5000),company_id=coalesce(p->>'companyId',company_id) where listing_id=l;
 return l;
end $$;
create function public.kalling_listing_set_status(p_listing uuid,p_status text) returns void language plpgsql security definer set search_path='' as $$
declare l public.kalling_listings; s public.kalling_listing_private; txt text; secret text; begin
 perform kalling_private.need_advisor();
 select * into l from public.kalling_listings where id=p_listing for update;select * into s from public.kalling_listing_private where listing_id=p_listing;
 if p_status='Live' then
  if length(l.headline)<12 or length(l.summary)<120 or l.asking_price<=0 or l.revenue<=0 or l.sde<=0 or cardinality(l.highlights)<3 then raise exception 'Complete the headline, a 120-character summary, price, revenue, SDE and three highlights before publishing.'; end if;
  txt=lower(l.headline||' '||l.summary||' '||l.reason||' '||array_to_string(l.highlights,' ')||' '||array_to_string(l.growth,' '));
  foreach secret in array array[lower(trim(coalesce(s.business_name,''))),lower(trim(coalesce(s.city,''))),split_part(regexp_replace(lower(coalesce(s.website,'')),'^https?://(www[.])?',''),'/',1)] loop
   if length(secret)>=4 and position(secret in txt)>0 then raise exception 'The public text mentions “%”. Remove it so the business stays anonymous.',secret; end if;
  end loop;
 end if;
 update public.kalling_listings set status=p_status,published_at=case when p_status='Live' then coalesce(published_at,now()) else published_at end,updated_at=now() where id=p_listing;
end $$;
create function public.kalling_buyer_vet(p_buyer uuid,p_status text,p_note text) returns void language plpgsql security definer set search_path='' as $$
begin perform kalling_private.need_advisor(); update public.kalling_buyers set status=p_status,advisor_note=left(coalesce(p_note,''),2000) where id=p_buyer; end $$;
create function public.kalling_access_decide(p_request uuid,p_status text,p_note text) returns void language plpgsql security definer set search_path='' as $$
begin perform kalling_private.need_advisor();
 if p_status not in ('Approved','Declined') then raise exception 'Choose approve or decline.'; end if;
 update public.kalling_access set status=p_status,decision_note=left(coalesce(p_note,''),1000),decided_at=now(),decided_by=auth.uid() where id=p_request; end $$;

-- ── Buyers ───────────────────────────────────────────────────────────────────────────
create function public.kalling_buyer_save_profile(p jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare b uuid; mail text; begin
 select email into mail from auth.users where id=auth.uid() and email_confirmed_at is not null;
 if mail is null then raise exception 'Sign in with a confirmed email first.' using errcode='42501'; end if;
 insert into public.kalling_buyers(user_id,email,name,phone,type,company,funds,financing,experience,regions,max_price,alerts)
  values(auth.uid(),lower(mail),trim(p->>'name'),left(coalesce(p->>'phone',''),40),p->>'type',left(coalesce(p->>'company',''),160),p->>'funds',
   coalesce((select array_agg(left(x,40)) from jsonb_array_elements_text(p->'financing') x),'{}'),trim(p->>'experience'),
   coalesce((select array_agg(x) from jsonb_array_elements_text(p->'regions') x),'{}'),greatest(0,coalesce((p->>'maxPrice')::bigint,0)),coalesce((p->>'alerts')::boolean,true))
 on conflict(user_id) do update set name=excluded.name,phone=excluded.phone,type=excluded.type,company=excluded.company,funds=excluded.funds,financing=excluded.financing,experience=excluded.experience,regions=excluded.regions,max_price=excluded.max_price,alerts=excluded.alerts
 returning id into b;
 return b;
end $$;
create function public.kalling_buyer_toggle_saved(p_listing uuid) returns void language plpgsql security definer set search_path='' as $$
declare b public.kalling_buyers=kalling_private.my_buyer(); begin
 if b.id is null then raise exception 'Create a buyer profile to save listings.'; end if;
 update public.kalling_buyers set saved=case when p_listing=any(saved) then array_remove(saved,p_listing) else saved||p_listing end where id=b.id;
end $$;
create function public.kalling_buyer_request_access(p_listing uuid,p_signed_name text,p_agreed boolean,p_message text,p_text_hash text) returns void language plpgsql security definer set search_path='' as $$
declare b public.kalling_buyers=kalling_private.my_buyer(); l public.kalling_listings; begin
 if b.id is null then raise exception 'Create a buyer profile before requesting details.'; end if;
 if b.status='Restricted' then raise exception 'Your account cannot request new listings. Contact Kalling.'; end if;
 select * into l from public.kalling_listings where id=p_listing;
 if l.status is null or l.status not in ('Live','Under LOI') then raise exception 'This listing is not accepting new requests.'; end if;
 if p_agreed is not true then raise exception 'Agree to the confidentiality terms to continue.'; end if;
 if lower(trim(coalesce(p_signed_name,'')))<>lower(b.name) then raise exception 'Type your full name exactly as it appears on your profile: %.',b.name; end if;
 if coalesce(p_text_hash,'')!~'^[0-9a-f]{64}$' then raise exception 'Agreement text missing.'; end if;
 if exists(select 1 from public.kalling_access where listing_id=p_listing and buyer_id=b.id and status in ('Pending','Approved')) then return; end if;
 if (select count(*) from public.kalling_access where buyer_id=b.id and created_at>now()-interval '1 day')>=10 then raise exception 'Ten requests per day is the limit. Try again tomorrow.'; end if;
 insert into public.kalling_access(listing_id,buyer_id,nda,message) values(p_listing,b.id,jsonb_build_object('version','kalling-listing-nda-2026-11','textHash',p_text_hash,'signedName',b.name,'signedAt',now()),left(coalesce(p_message,''),1500));
end $$;
create function public.kalling_listing_ask(p_listing uuid,p_body text,p_buyer uuid default null) returns void language plpgsql security definer set search_path='' as $$
declare b public.kalling_buyers; begin
 if length(trim(coalesce(p_body,''))) not between 2 and 3000 then raise exception 'Write your question.'; end if;
 if p_buyer is not null then perform kalling_private.need_advisor();
  insert into public.kalling_listing_questions(listing_id,buyer_id,side,author,body) values(p_listing,p_buyer,'advisor',kalling_private.actor_name(),trim(p_body)); return; end if;
 b=kalling_private.my_buyer();
 if b.id is null or not kalling_private.has_access(p_listing) then raise exception 'Sign the NDA and wait for approval before asking questions or making an offer.'; end if;
 insert into public.kalling_listing_questions(listing_id,buyer_id,side,author,body) values(p_listing,b.id,'buyer',b.name,trim(p_body));
end $$;
create function public.kalling_buyer_offer(p_listing uuid,p jsonb) returns void language plpgsql security definer set search_path='' as $$
declare b public.kalling_buyers=kalling_private.my_buyer(); begin
 if b.id is null or not kalling_private.has_access(p_listing) then raise exception 'Sign the NDA and wait for approval before asking questions or making an offer.'; end if;
 if (select status from public.kalling_listings where id=p_listing) not in ('Live','Under LOI') then raise exception 'This listing is not accepting offers.'; end if;
 insert into public.kalling_offers(listing_id,buyer_id,kind,price,cash_at_close,seller_note,earnout,financing,close_days,conditions)
  values(p_listing,b.id,p->>'kind',(p->>'price')::bigint,(p->>'cashAtClose')::bigint,(p->>'sellerNote')::bigint,(p->>'earnout')::bigint,left(coalesce(p->>'financing',''),200),(p->>'closeDays')::int,left(coalesce(p->>'conditions',''),2000));
exception when check_violation then raise exception 'Cash at close, seller note and earnout should add up to the offer price, and closing should be 14 to 365 days out.';
end $$;
create function public.kalling_offer_update(p_offer uuid,p_status text,p_note text) returns void language plpgsql security definer set search_path='' as $$
declare o public.kalling_offers; begin
 select * into o from public.kalling_offers where id=p_offer for update;
 if o.id is null then raise exception 'Offer not found.'; end if;
 if coalesce(kalling_private.advisor_role(),'') in ('owner','admin','analyst') then
  update public.kalling_offers set status=p_status,advisor_note=left(coalesce(p_note,''),1500),updated_at=now() where id=p_offer;
  if p_status='Accepted' and o.kind='Letter of intent' then update public.kalling_listings set status='Under LOI',updated_at=now() where id=o.listing_id and status='Live'; end if;
 elsif o.buyer_id=(kalling_private.my_buyer()).id and p_status='Withdrawn' and o.status not in ('Accepted','Declined') then
  update public.kalling_offers set status='Withdrawn',updated_at=now() where id=p_offer;
 else raise exception 'You can only withdraw your own open offer.' using errcode='42501'; end if;
end $$;

-- Fictional, clearly labeled sample listings so the marketplace can be demonstrated.
insert into public.kalling_listings(number,status,sample,headline,region,focus,asking_price,revenue,sde,established,employees,technicians,agreements,recurring_pct,residential_pct,vehicles,real_estate,seller_financing,reason,summary,highlights,growth,published_at) values
('KL-1038','Live',true,'Owner-operated HVAC service shop at the Jersey Shore','Jersey Shore','Residential service & replacement',620000,1150000,235000,2012,5,3,310,39,88,4,'Home-based',true,'Owner retiring','Small, profitable service shop serving year-round homes and seasonal rentals along the shore. A strong first acquisition for a licensed technician or owner-operator buyer, with seller financing available to a qualified buyer.',array['310 maintenance agreements concentrated in two towns','Seasonal rental property managers provide steady spring and fall work','Low overhead, home-based office','Seller financing available'],array['Formalize a maintenance membership program'],now()),
('KL-1047','Live',true,'Residential HVAC service company with 1,900 maintenance agreements','Central Jersey','Residential service & replacement',3400000,4600000,860000,1998,24,13,1900,58,92,16,'Leased facility',true,'Owner retiring after 27 years','Family-owned heating and cooling contractor serving homeowners across two Central Jersey counties. Most revenue comes from service calls, maintenance agreements and system replacements for existing customers rather than new construction. A general manager and dispatcher run daily operations; the owner focuses on estimates and supplier relationships.',array['1,900 active maintenance agreements with 84% annual renewal','13 field technicians, 3 holding NJ master HVACR licenses','Replacement leads generated from the agreement base','General manager in place for six years'],array['Add a plumbing or electrical line to the existing customer base','Membership pricing has not been raised since 2023'],now()),
('KL-1041','Live',true,'Long Island heating and cooling business with strong reviews','Long Island','Residential service & replacement',1650000,2700000,470000,2009,12,7,820,44,96,8,'Leased facility',true,'Owner relocating out of state','Owner-led residential HVAC company covering Nassau and western Suffolk. Known locally for fast service and clean installs, with a high review rating across 600+ reviews. Heat pump and ductless installations are a growing share of replacement work, supported by utility rebate programs.',array['820 maintenance agreements','600+ online reviews averaging 4.8 stars','Growing heat pump and ductless share','Seller will stay for a 6-month transition'],array['Hire an outside sales technician','Add indoor air quality services'],now());
insert into public.kalling_listing_private(listing_id,business_name,city,details) select id,'Sample listing — no real business','Illustrative only','This is a sample listing used to demonstrate how Kalling shares confidential details after an approved NDA.' from public.kalling_listings where sample;
select setval('kalling_private.listing_number',1100);

revoke all on all functions in schema kalling_private from public,anon,authenticated;
grant execute on function kalling_private.role_for(uuid),kalling_private.can_upload(text),kalling_private.can_download(text),kalling_private.portal_role(uuid),kalling_private.can_upload_portal(text),kalling_private.can_download_portal(text),kalling_private.advisor_role(),kalling_private.house(),kalling_private.has_access(uuid),kalling_private.my_buyer() to authenticated;
grant execute on function kalling_private.advisor_role(),kalling_private.house() to anon;
grant usage on schema kalling_private to anon;
revoke all on function public.kalling_submit_lead(jsonb) from public; grant execute on function public.kalling_submit_lead(jsonb) to anon,authenticated;
revoke all on function public.kalling_brokerage_set_house(uuid),public.kalling_lead_update(uuid,text,text),public.kalling_listing_save(jsonb),public.kalling_listing_set_status(uuid,text),public.kalling_buyer_vet(uuid,text,text),public.kalling_access_decide(uuid,text,text),public.kalling_buyer_save_profile(jsonb),public.kalling_buyer_toggle_saved(uuid),public.kalling_buyer_request_access(uuid,text,boolean,text,text),public.kalling_listing_ask(uuid,text,uuid),public.kalling_buyer_offer(uuid,jsonb),public.kalling_offer_update(uuid,text,text) from public,anon;
grant execute on function public.kalling_brokerage_set_house(uuid),public.kalling_lead_update(uuid,text,text),public.kalling_listing_save(jsonb),public.kalling_listing_set_status(uuid,text),public.kalling_buyer_vet(uuid,text,text),public.kalling_access_decide(uuid,text,text),public.kalling_buyer_save_profile(jsonb),public.kalling_buyer_toggle_saved(uuid),public.kalling_buyer_request_access(uuid,text,boolean,text,text),public.kalling_listing_ask(uuid,text,uuid),public.kalling_buyer_offer(uuid,jsonb),public.kalling_offer_update(uuid,text,text) to authenticated;
commit;
