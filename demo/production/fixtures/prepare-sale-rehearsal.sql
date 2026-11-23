-- Prepare the complete hosted sale rehearsal: one clearly fictional seller inquiry.
-- Run in the Supabase SQL editor before `node e2e/hosted-sale.mjs`. It refuses real
-- marketplace data, keeps public intake closed, sends nothing, and calls no model.
-- The rehearsal itself then runs the entire sale through the app's own screens.
begin;
do $fixture$
declare s kalling_private.brokerage_settings; owner_id uuid; seller_id uuid; buyer_id uuid; specialist_id uuid; n integer;
begin
 select id into owner_id from auth.users where email='owner-a-20261114@kalling-validation.invalid' and email_confirmed_at is not null;
 select id into seller_id from auth.users where email='seller-20261114@kalling-validation.invalid' and email_confirmed_at is not null;
 select id into buyer_id from auth.users where email='buyer-20261114@kalling-validation.invalid' and email_confirmed_at is not null;
 select id into specialist_id from auth.users where email='specialist-20261114@kalling-validation.invalid' and email_confirmed_at is not null;
 if owner_id is null or seller_id is null or buyer_id is null or specialist_id is null then raise exception 'The confirmed fictional accounts from the foundation acceptance are required.'; end if;

 select * into s from kalling_private.brokerage_settings;
 if s.firm_id is null then raise exception 'The fictional private brokerage from the buyer-access fixture must already be configured.'; end if;
 if s.intake_open then raise exception 'Public intake must stay closed for a rehearsal.'; end if;
 if not exists(select 1 from public.kalling_firms f where f.id=s.firm_id and f.created_by=owner_id and f.name like 'Fictional hosted validation A %') then raise exception 'The brokerage house must be the fictional validation firm.'; end if;
 if exists(select 1 from public.kalling_listings where not sample) then raise exception 'Only sample listings may exist. A real listing means this is no longer a test project.'; end if;
 if exists(select 1 from public.kalling_leads where email not like '%@kalling-validation.invalid') then raise exception 'Only fictional leads may exist before the rehearsal.'; end if;

 -- The buyer and specialist keep private-pilot registration; no one else can register.
 update kalling_private.brokerage_settings set pilot_buyers=(select array_agg(distinct x) from unnest(pilot_buyers||array[buyer_id,specialist_id]) x);

 -- Earlier access-guard tests can leave the fictional buyer Restricted, which blocks NDA requests
 -- mid-rehearsal. Reset it here, in the open, and record the reset in the firm's activity log.
 if exists(select 1 from public.kalling_buyers where user_id=buyer_id and status='Restricted') then
  update public.kalling_buyers set status='Registered' where user_id=buyer_id;
  insert into public.kalling_audit(firm_id,actor_id,event,detail)
  values(s.firm_id,owner_id,'Rehearsal reset the fictional buyer from Restricted to Registered',jsonb_build_object('buyer',buyer_id,'source','prepare-sale-rehearsal.sql'));
 end if;

 -- One fictional seller inquiry, exactly as the paused public form would have recorded it.
 -- The form itself stays closed; the rehearsal verifies that refusal in the browser first.
 if not exists(select 1 from public.kalling_leads where email='seller-20261114@kalling-validation.invalid' and status='New') then
  insert into public.kalling_leads(name,email,phone,business_name,region,timing,message,valuation,source)
  values('Pat Russo (fictional)','seller-20261114@kalling-validation.invalid','','Sample: Russo Heating & Air (fictional)','Central Jersey','Within a year',
   'Fictional seller inquiry for the hosted sale rehearsal. No real business is represented.',
   jsonb_build_object('revenue',2000000,'sde',370000,'low',1020000,'high',1320000),'valuation');
 end if;
 select count(*) into n from public.kalling_leads where email='seller-20261114@kalling-validation.invalid' and status='New';
 if n<>1 then raise exception 'Expected exactly one open fictional rehearsal inquiry, found %.',n; end if;
end $fixture$;
commit;
select json_build_object('mode','sale-rehearsal','status','prepared',
 'lead',(select id from public.kalling_leads where email='seller-20261114@kalling-validation.invalid' and status='New'),
 'intakeOpen',(select intake_open from kalling_private.brokerage_settings),
 'pilotBuyers',(select cardinality(pilot_buyers) from kalling_private.brokerage_settings),
 'nonSampleListings',(select count(*) from public.kalling_listings where not sample),
 'buyerStatus',(select b.status from public.kalling_buyers b join auth.users u on u.id=b.user_id where u.email='buyer-20261114@kalling-validation.invalid')) as sale_rehearsal_fixture;
