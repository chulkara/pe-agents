-- Keep public intake paused while administrators configure a private brokerage.
-- Authenticated metadata uses the same current permission and logged ticket as bytes.
begin;
alter table kalling_private.brokerage_settings add column intake_open boolean not null default false,
 add column pilot_buyers uuid[] not null default '{}' check(cardinality(pilot_buyers)<=50);
-- This global role must be provisioned by the project administrator. A firm owner
-- must not claim every marketplace buyer or proof document through a public RPC.
revoke all on function public.kalling_brokerage_set_house(uuid) from public,anon,authenticated;
comment on function public.kalling_brokerage_set_house(uuid) is 'Administrative provisioning only; this function does not open public intake.';

create function public.kalling_brokerage_status() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('configured',kalling_private.house() is not null,
 'intakeOpen',coalesce((select s.intake_open from kalling_private.brokerage_settings s where s.id),false),
 'firmId',case when auth.uid() is not null and kalling_private.advisor_role() in ('owner','admin','analyst') then kalling_private.house() end)
$$;
revoke all on function public.kalling_brokerage_status() from public,anon,authenticated;
grant execute on function public.kalling_brokerage_status() to anon,authenticated;

create or replace function public.kalling_submit_lead(p jsonb) returns void language plpgsql security definer set search_path='' as $$
declare e text=lower(trim(coalesce(p->>'email',''))); begin
 if not coalesce((select s.intake_open from kalling_private.brokerage_settings s where s.id),false) then raise exception 'Seller inquiries are not open yet. Please email us instead.'; end if;
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

-- Administrative, bounded invitations allow a private buyer pilot without
-- opening registration to every confirmed account. Existing buyers keep access.
create function kalling_private.buyer_intake_allowed() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from kalling_private.brokerage_settings s where s.id and (s.intake_open or auth.uid()=any(s.pilot_buyers)))
$$;
revoke all on function kalling_private.buyer_intake_allowed() from public,anon,authenticated;

create or replace function public.kalling_buyer_save_profile(p jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare b uuid; mail text; begin
 if not kalling_private.buyer_intake_allowed() and not exists(select 1 from public.kalling_buyers where user_id=auth.uid()) then raise exception 'Buyer registration is not open. Contact Kalling for private pilot access.' using errcode='42501';end if;
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

-- Exact copy of the current client template, including its listing number and
-- headline. No legal terms change here; attorney review remains outstanding.
create function kalling_private.nda_text(l public.kalling_listings) returns text language sql immutable set search_path='' as $fn$
 select format($nda$CONFIDENTIALITY AGREEMENT: LISTING %s

In exchange for receiving confidential information about the business offered as listing %s (“%s”), I agree that:

1. I will use the information only to evaluate a possible acquisition of this business.
2. I will not disclose the business’s identity or any information I receive to anyone except my advisors, lenders and investors who need it for that evaluation and who are bound to keep it confidential. I am responsible for their compliance.
3. I will not contact the owner, employees, customers, suppliers, landlord or lenders of the business except through Kalling, unless the owner agrees in writing.
4. I will not solicit or hire the business’s employees for two years, except through general advertising.
5. If I stop evaluating the business, or Kalling asks, I will return or destroy the information.
6. This agreement lasts for two years. It does not oblige either side to complete a transaction. It is governed by New Jersey law.

Information not already public, received from Kalling or the seller, is confidential under this agreement.$nda$,l.number,l.number,l.headline)
$fn$;
revoke all on function kalling_private.nda_text(public.kalling_listings) from public,anon,authenticated;

create or replace function public.kalling_buyer_request_access(p_listing uuid,p_signed_name text,p_agreed boolean,p_message text,p_text_hash text) returns void language plpgsql security definer set search_path='' as $$
declare b public.kalling_buyers=kalling_private.my_buyer(); l public.kalling_listings; begin
 if b.id is null then raise exception 'Create a buyer profile before requesting details.'; end if;
 perform 1 from public.kalling_buyers where id=b.id for update;
 if b.status='Restricted' then raise exception 'Your account cannot request new listings. Contact Kalling.'; end if;
 select * into l from public.kalling_listings where id=p_listing for share;
 if l.status is null or l.status not in ('Live','Under LOI') then raise exception 'This listing is not accepting new requests.'; end if;
 if p_agreed is not true then raise exception 'Agree to the confidentiality terms to continue.'; end if;
 if lower(trim(coalesce(p_signed_name,'')))<>lower(b.name) then raise exception 'Type your full name exactly as it appears on your profile: %.',b.name; end if;
 if p_text_hash is distinct from encode(sha256(convert_to(kalling_private.nda_text(l),'UTF8')),'hex') then raise exception 'The agreement changed or its fingerprint does not match. Reload the listing and review the agreement again.'; end if;
 if exists(select 1 from public.kalling_access where listing_id=p_listing and buyer_id=b.id and status in ('Pending','Approved') and nda->>'version'='kalling-listing-nda-2026-11' and nda->>'textHash'=p_text_hash) then return; end if;
 -- A changed agreement creates a new pending request and requires fresh review.
 update public.kalling_access set status='Withdrawn',decision_note='The agreement changed. A new signed request replaces this version.'
 where listing_id=p_listing and buyer_id=b.id and status in ('Pending','Approved');
 if (select count(*) from public.kalling_access where buyer_id=b.id and created_at>now()-interval '1 day')>=10 then raise exception 'Ten requests per day is the limit. Try again tomorrow.'; end if;
 insert into public.kalling_access(listing_id,buyer_id,nda,message) values(p_listing,b.id,jsonb_build_object('version','kalling-listing-nda-2026-11','textHash',p_text_hash,'signedName',b.name,'signedAt',now()),left(coalesce(p_message,''),1500));
end $$;

create or replace function public.kalling_access_decide(p_request uuid,p_status text,p_note text) returns void language plpgsql security definer set search_path='' as $$
declare a public.kalling_access;l public.kalling_listings;begin
 perform kalling_private.need_advisor();
 if p_status not in ('Approved','Declined') then raise exception 'Choose approve or decline.';end if;
 select * into a from public.kalling_access where id=p_request for update;
 if a.id is null then raise exception 'Access request not found.';end if;
 select * into l from public.kalling_listings where id=a.listing_id for share;
 if p_status='Approved' and (a.nda->>'version' is distinct from 'kalling-listing-nda-2026-11'
 or a.nda->>'textHash' is distinct from encode(sha256(convert_to(kalling_private.nda_text(l),'UTF8')),'hex')
 or not exists(select 1 from public.kalling_buyers b where b.id=a.buyer_id and b.status<>'Restricted')) then
  raise exception 'A current signed agreement and eligible buyer are required. Ask the buyer to review the current agreement.';end if;
 update public.kalling_access set status=p_status,decision_note=left(coalesce(p_note,''),1000),decided_at=now(),decided_by=auth.uid() where id=a.id;
end $$;

alter policy kalling_dataroom_read on storage.objects using(
 bucket_id='kalling-portal' and storage.allow_any_operation(array['object.get_authenticated_info','object.get_authenticated'])
 and kalling_private.dataroom_ticket_ok(name)
);

-- An absent advisor role is false, never SQL NULL. Callers using NOT allowed
-- must not accidentally skip a denial for an unrelated signed-in account.
create or replace function kalling_private.verification_allowed(p_buyer uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and coalesce(
  exists(select 1 from public.kalling_buyers b where b.id=p_buyer and b.user_id=auth.uid())
  or kalling_private.advisor_role() in ('owner','admin','analyst'),false)
$$;

create or replace function kalling_private.verification_storage_ok(p_path text,p_upload boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(
  select 1 from public.kalling_verification_files f
  join public.kalling_verification_submissions v on v.id=f.submission_id
  join public.kalling_buyers b on b.id=v.buyer_id
  where f.object_path=p_path and case when p_upload then
   b.user_id=auth.uid() and f.status='reserved' and v.status='Draft'
   and not exists(select 1 from public.kalling_verification_submissions n where n.buyer_id=b.id and n.version>v.version)
  else kalling_private.verification_allowed(b.id) and (
   storage.allow_only_operation('object.get_authenticated_info') and b.user_id=auth.uid()
   or storage.allow_any_operation(array['object.get_authenticated_info','object.get_authenticated']) and exists(
    select 1 from kalling_private.verification_tickets t join kalling_private.verification_events e on e.id=t.event_id
    where t.file_id=f.id and t.user_id=auth.uid() and t.created_at<=now() and t.created_at>now()-interval '2 minutes'
     and e.actor_id=auth.uid() and e.file_id=f.id and e.submission_id=v.id and e.action='Document opened'))
  end)
$$;
comment on function kalling_private.verification_storage_ok(text,boolean) is 'Buyer upload-recovery metadata or a logged, short-lived read by the current buyer/reviewer. No signed links or listing.';
commit;
