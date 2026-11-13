begin;
create table kalling_private.preparation_items(buyer_id uuid not null references public.kalling_buyers(id),item_key text not null,item jsonb not null,primary key(buyer_id,item_key));
create table kalling_private.lender_contacts(id uuid primary key default gen_random_uuid(),contact jsonb not null);
create table kalling_private.introductions(id uuid primary key default gen_random_uuid(),buyer_id uuid not null references public.kalling_buyers(id),listing_id uuid references public.kalling_listings(id),data jsonb not null,lease uuid,lease_until timestamptz);
create table kalling_private.introduction_versions(request_id uuid not null references kalling_private.introductions(id),version int not null,payload jsonb not null,at timestamptz not null default now(),primary key(request_id,version));
alter table kalling_private.preparation_items enable row level security;alter table kalling_private.lender_contacts enable row level security;alter table kalling_private.introductions enable row level security;alter table kalling_private.introduction_versions enable row level security;
revoke all on kalling_private.preparation_items,kalling_private.lender_contacts,kalling_private.introductions,kalling_private.introduction_versions from public,anon,authenticated;
create function public.kalling_preparation_items(p_buyer uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$declare b uuid=p_buyer;begin
 if coalesce(kalling_private.advisor_role(),'') not in ('owner','admin','analyst','viewer') then b=(kalling_private.my_buyer()).id;if b is null or p_buyer is not null and p_buyer<>b then raise exception 'Preparation access denied.' using errcode='42501';end if;end if;
 return coalesce((select jsonb_agg(i.item order by i.item_key) from kalling_private.preparation_items i where b is null or i.buyer_id=b),'[]');end $$;
create function public.kalling_preparation_save(p jsonb,p_buyer uuid default null) returns void language plpgsql security definer set search_path='' as $$declare b uuid;out jsonb;begin
 if coalesce(kalling_private.advisor_role(),'') in ('owner','admin','analyst') then b=p_buyer;else b=(kalling_private.my_buyer()).id;if p->>'status'='Reviewed by advisor' or p_buyer is not null and p_buyer<>b then raise exception 'An authorized advisor must review this item.' using errcode='42501';end if;end if;
 if b is null then raise exception 'Select a buyer.' using errcode='42501';end if;
 if p->>'key' is null or p->>'key' not in ('plan','purpose','capital','financials','projections','questions') or p->>'status' is null or p->>'status' not in ('Not started','In progress','Prepared by buyer','Reviewed by advisor','Not applicable') or p->>'status'='Not applicable' and length(trim(coalesce(p->>'note','')))<5 then raise exception 'Choose a preparation item/status and explain any not-applicable item.';end if;
 if nullif(p->>'verificationRef','') is not null and not exists(select 1 from public.kalling_verification_submissions v where v.id=(p->>'verificationRef')::uuid and v.buyer_id=b) then raise exception 'Reference only this buyer financing evidence.';end if;
 if coalesce(p->>'note','')~*'(https?://|[0-9]{3}[- ][0-9]{2}[- ][0-9]{4}|social security|routing number|account number|password)' then raise exception 'Use the lender secure process for sensitive personal application data.';end if;
 out=jsonb_build_object('buyerId',b,'key',p->>'key','status',p->>'status','note',left(coalesce(p->>'note',''),600),'verificationRef',nullif(p->>'verificationRef',''),'updatedAt',now())||case when p->>'status'='Reviewed by advisor' then jsonb_build_object('reviewedBy',kalling_private.actor_name()) else '{}'::jsonb end;
 insert into kalling_private.preparation_items values(b,p->>'key',out) on conflict(buyer_id,item_key) do update set item=excluded.item;
end $$;
create function public.kalling_lender_contacts() returns jsonb language plpgsql stable security definer set search_path='' as $$begin perform kalling_private.need_advisor();return coalesce((select jsonb_agg(c.contact order by c.contact->>'name') from kalling_private.lender_contacts c),'[]');end $$;
create function public.kalling_lender_contact_save(p jsonb) returns void language plpgsql security definer set search_path='' as $$declare contact_id uuid=coalesce(nullif(p->>'id','')::uuid,gen_random_uuid());old jsonb;out jsonb;begin
 if coalesce(kalling_private.advisor_role(),'') not in ('owner','admin') then raise exception 'Only an owner or administrator can configure lender contacts.' using errcode='42501';end if;
 if length(trim(coalesce(p->>'name','')))<2 or coalesce(p->>'email','')!~'^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception 'Provide a named contact and valid email.';end if;
 select c.contact into old from kalling_private.lender_contacts c where c.id=contact_id for update;
 out=jsonb_build_object('id',contact_id,'name',left(trim(p->>'name'),160),'email',left(lower(trim(p->>'email')),254),'active',coalesce((p->>'active')::boolean,true),'version',coalesce((old->>'version')::int,0)+1);
 insert into kalling_private.lender_contacts values(contact_id,out) on conflict on constraint lender_contacts_pkey do update set contact=excluded.contact;
 update kalling_private.introductions set data=(data-'consent'-'approval')||jsonb_build_object('status','Advisor reviewing','nextStep','Contact changed. Prepare a new exact preview for buyer consent.'),lease=null,lease_until=null where data->'payload'->'recipient'->>'id'=contact_id::text and data->>'status' not in ('Introduction sent','Acknowledged','Closed','Withdrawn');
end $$;
create function kalling_private.intro_text(p_text text,p_listing uuid) returns void language plpgsql stable security definer set search_path='' as $$declare lp public.kalling_listing_private;begin
 if length(trim(coalesce(p_text,''))) not between 10 and 1400 or p_text~*'(https?://|[0-9]{3}[- ]?[0-9]{2}[- ]?[0-9]{4}|\m(account|routing|social security|credit report|password|bank balance)\M)' then raise exception 'Remove sensitive account, identity, credit and private-link details. Use a short non-sensitive summary.';end if;
 select * into lp from public.kalling_listing_private where listing_id=p_listing;
 if p_listing is not null and not exists(select 1 from public.kalling_listings where id=p_listing and status in ('Live','Under LOI')) then raise exception 'Choose an available public listing.';end if;
 if cardinality(kalling_private.anonymity_problems(p_text,coalesce(lp.business_name,''),coalesce(lp.city,''),coalesce(lp.website,''),coalesce(lp.owner_name,'')))>0 then raise exception 'Remove identifying seller or confidential details from the introduction.';end if;
end $$;
create function public.kalling_intro_request(p jsonb) returns void language plpgsql security definer set search_path='' as $$declare b public.kalling_buyers=kalling_private.my_buyer();l uuid=nullif(p->>'listingId','')::uuid;id uuid=gen_random_uuid();out jsonb;begin
 if b.id is null or b.status='Restricted' then raise exception 'Sign in with an unrestricted buyer profile.' using errcode='42501';end if;
 if length(trim(coalesce(p->>'purpose','')))<5 or p->>'contactMethod' is null or p->>'contactMethod' not in ('Email','Phone') then raise exception 'Describe the purpose and choose a contact method.';end if;
 perform kalling_private.intro_text(coalesce(p->>'summary','')||E'\n'||coalesce(p->>'purpose',''),l);
 out=jsonb_build_object('id',id,'buyerId',b.id,'listingId',l,'purpose',left(p->>'purpose',200),'summary',left(p->>'summary',1200),'contactMethod',p->>'contactMethod','version',1,'status','Submitted','nextStep','Kalling will review your request. Nothing has been sent to a lender.','createdAt',now(),'updatedAt',now(),'events',jsonb_build_array(jsonb_build_object('action','Submitted','at',now(),'by',kalling_private.actor_name(),'version',1)));
 insert into kalling_private.introductions(id,buyer_id,listing_id,data) values(id,b.id,l,out);
end $$;
create function public.kalling_intro_list() returns jsonb language plpgsql stable security definer set search_path='' as $$declare b uuid;begin
 if coalesce(kalling_private.advisor_role(),'') not in ('owner','admin','analyst','viewer') then b=(kalling_private.my_buyer()).id;if b is null then raise exception 'Introduction access denied.' using errcode='42501';end if;end if;
 return coalesce((select jsonb_agg(r.data||jsonb_build_object('snapshot',md5((r.data->'payload')::text)) order by r.data->>'createdAt' desc) from kalling_private.introductions r where b is null or r.buyer_id=b),'[]');end $$;
create function kalling_private.intro_current(r kalling_private.introductions) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.kalling_buyers b join auth.users u on u.id=b.user_id join kalling_private.lender_contacts c on c.id=(r.data->'payload'->'recipient'->>'id')::uuid where b.id=r.buyer_id and b.status<>'Restricted' and u.email_confirmed_at is not null and b.name=r.data->'payload'->'buyer'->>'name' and b.email=r.data->'payload'->'buyer'->>'email' and (r.data->>'contactMethod'<>'Phone' or b.phone=r.data->'payload'->'buyer'->>'phone') and (c.contact->>'active')::boolean and c.contact=r.data->'payload'->'recipient' and (r.listing_id is null or exists(select 1 from public.kalling_listings l where l.id=r.listing_id and l.status in ('Live','Under LOI') and l.number=r.data->'payload'->'listing'->>'number' and l.headline=r.data->'payload'->'listing'->>'headline' and l.region=r.data->'payload'->'listing'->>'region')))
$$;
create function public.kalling_intro_change(p_id uuid,p jsonb) returns void language plpgsql security definer set search_path='' as $$declare r kalling_private.introductions;n jsonb;action text=p->>'action';buyer boolean;contact jsonb;b public.kalling_buyers;l public.kalling_listings;snapshot text;version int;begin
 select * into r from kalling_private.introductions where id=p_id for update;
 buyer=r.buyer_id=(kalling_private.my_buyer()).id;if r.id is null then raise exception 'Request not found.';end if;
 if not coalesce(buyer,false) then perform kalling_private.need_advisor();end if;
 if r.data->>'status' in ('Closed','Withdrawn') then raise exception 'This request is closed.';end if;
 n=r.data;version=(n->>'version')::int;snapshot=md5((n->'payload')::text);
 if action='Prepare preview' then
  perform kalling_private.need_advisor();if n->>'status' in ('Introduction sent','Acknowledged') then raise exception 'This introduction was already sent.';end if;
  select c.contact into contact from kalling_private.lender_contacts c where c.id=(p->>'lenderId')::uuid and (c.contact->>'active')::boolean;if contact is null then raise exception 'Choose an actual configured lender contact.';end if;
  perform kalling_private.intro_text(coalesce(p->>'summary','')||E'\n'||coalesce(n->>'purpose',''),r.listing_id);select * into b from public.kalling_buyers where id=r.buyer_id;select * into l from public.kalling_listings where id=r.listing_id;
  version=version+1;n=(n-'consent'-'approval')||jsonb_build_object('version',version,'summary',left(p->>'summary',1200),'status','Awaiting buyer consent','nextStep','Buyer reviews the named recipient and exact introduction.','payload',jsonb_build_object('recipient',contact,'buyer',jsonb_build_object('name',b.name,'email',b.email,'phone',case when n->>'contactMethod'='Phone' then b.phone else '' end),'purpose',n->>'purpose','summary',left(p->>'summary',1200),'contactMethod',n->>'contactMethod','listing',case when l.id is not null then jsonb_build_object('number',l.number,'headline',l.headline,'region',l.region,'url','https://chulkara.github.io/pe-agents/#/listings/'||l.number) end));
  insert into kalling_private.introduction_versions values(r.id,version,n->'payload',now());
 elsif action='Consent' then
  if not coalesce(buyer,false) or n->>'status'<>'Awaiting buyer consent' or n->'payload' is null or p->>'snapshot' is distinct from snapshot or not kalling_private.intro_current(r) then raise exception 'Review the current named recipient and exact summary before consenting.';end if;
  n=n||jsonb_build_object('consent',jsonb_build_object('version',version,'snapshot',snapshot,'at',now()),'status','Ready for approval','nextStep','Advisor must approve the exact consented introduction. Email delivery is not configured.');
 elsif action='Revoke consent' then
  if not coalesce(buyer,false) or n->>'status' in ('Introduction sent','Acknowledged') then raise exception 'Consent cannot undo an introduction already sent.';end if;
  n=(n-'consent'-'approval')||jsonb_build_object('status','Awaiting buyer consent','nextStep','Consent revoked. No external delivery is permitted.');
 elsif action in ('Approve','Simulate') then
  perform kalling_private.need_advisor();if n->>'status'<>'Ready for approval' or n->'consent'->>'snapshot' is distinct from snapshot or not kalling_private.intro_current(r) then raise exception 'Current buyer consent and exact preview are required.';end if;
  if action='Approve' then
   if p->>'snapshot' is distinct from snapshot then raise exception 'The exact preview changed.';end if;
   n=n||jsonb_build_object('approval',jsonb_build_object('version',version,'snapshot',snapshot,'by',auth.uid(),'at',now()),'nextStep','Approved preview. Email delivery is not configured.');
  else
   if n->'approval'->>'snapshot' is distinct from snapshot then raise exception 'Advisor approval is required.';end if;
   n=n||jsonb_build_object('simulatedAt',now(),'nextStep','Simulated introduction only. No email was sent and no lender response is implied.');
  end if;
 elsif action='Withdraw' then
  if n->>'status' in ('Introduction sent','Acknowledged') then raise exception 'This introduction was already sent.';end if;
  n=(n-'consent'-'approval')||jsonb_build_object('status','Withdrawn','nextStep','Withdrawn. No delivery is permitted.');
 elsif action='Close' then perform kalling_private.need_advisor();n=n||jsonb_build_object('status','Closed','nextStep','Closed by the advisor.');
 elsif action='Acknowledged' then
  perform kalling_private.need_advisor();if n->>'status'<>'Introduction sent' or length(trim(coalesce(p->>'response','')))<10 then raise exception 'Record an actual lender response after a real introduction.';end if;
  n=n||jsonb_build_object('status','Acknowledged','nextStep',left(p->>'response',500));
 elsif action='Advisor reviewing' then perform kalling_private.need_advisor();if n->>'status'<>'Submitted' then raise exception 'Already in progress.';end if;n=n||jsonb_build_object('status','Advisor reviewing','nextStep','Advisor reviews the request and selects a configured lender.');
 else raise exception 'Choose a valid request action.';end if;
 n=n||jsonb_build_object('updatedAt',now(),'events',coalesce(n->'events','[]')||jsonb_build_array(jsonb_build_object('action',action,'at',now(),'by',kalling_private.actor_name(),'version',version)));
 update kalling_private.introductions set data=n,lease=null,lease_until=null where id=r.id;
 insert into public.kalling_audit(firm_id,actor_id,event,detail) values(kalling_private.house(),auth.uid(),'marketplace.introduction',jsonb_build_object('id',r.id,'version',version,'action',action));
end $$;
create function public.kalling_intro_claim(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare r kalling_private.introductions;t uuid=gen_random_uuid();snap text;begin
 select * into r from kalling_private.introductions where id=p_id for update skip locked;if r.id is null then return null;end if;
 if r.lease is not null then if r.lease_until<=now() then update kalling_private.introductions set data=data||jsonb_build_object('deliveryState','Delivery uncertain','nextStep','Delivery interrupted. Reconcile before any retry.') where id=r.id;end if;return null;end if;
 snap=md5((r.data->'payload')::text);
 if r.data->>'status'<>'Ready for approval' or r.data->'consent'->>'snapshot' is distinct from snap or r.data->'approval'->>'snapshot' is distinct from snap or not kalling_private.intro_current(r) or not exists(select 1 from public.kalling_members where user_id=(r.data->'approval'->>'by')::uuid and active and firm_id=kalling_private.house() and role in ('owner','admin','analyst')) then return null;end if;
 update kalling_private.introductions set lease=t,lease_until=now()+interval '1 minute',data=data||jsonb_build_object('deliveryState','Sending') where id=r.id;return jsonb_build_object('lease',t,'payload',r.data->'payload');
end $$;
create function public.kalling_intro_complete(p_id uuid,p_lease uuid,p_provider text) returns void language plpgsql security definer set search_path='' as $$declare r kalling_private.introductions;begin
 select * into r from kalling_private.introductions where id=p_id for update;
 if r.lease is null or p_lease is null or r.lease is distinct from p_lease or r.lease_until<=now() or r.data->'consent'->>'snapshot' is distinct from md5((r.data->'payload')::text) or r.data->'approval'->>'snapshot' is distinct from md5((r.data->'payload')::text) or not kalling_private.intro_current(r) or r.data->>'status'<>'Ready for approval' or coalesce(length(p_provider),0)=0 then raise exception 'Current consent, approval, lease and provider acknowledgment are required.';end if;
 update kalling_private.introductions set lease=null,lease_until=null,data=data||jsonb_build_object('status','Introduction sent','deliveryState','Provider accepted','providerId',p_provider,'nextStep','Provider accepted the introduction. Await an actual lender response; delivery is not confirmed.','updatedAt',now()) where id=r.id;
end $$;
revoke all on function kalling_private.intro_text(text,uuid),kalling_private.intro_current(kalling_private.introductions) from public,anon,authenticated;
revoke all on function public.kalling_preparation_items(uuid),public.kalling_preparation_save(jsonb,uuid),public.kalling_lender_contacts(),public.kalling_lender_contact_save(jsonb),public.kalling_intro_request(jsonb),public.kalling_intro_list(),public.kalling_intro_change(uuid,jsonb),public.kalling_intro_claim(uuid),public.kalling_intro_complete(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.kalling_preparation_items(uuid),public.kalling_preparation_save(jsonb,uuid),public.kalling_lender_contacts(),public.kalling_lender_contact_save(jsonb),public.kalling_intro_request(jsonb),public.kalling_intro_list(),public.kalling_intro_change(uuid,jsonb) to authenticated;
grant execute on function public.kalling_intro_claim(uuid),public.kalling_intro_complete(uuid,uuid,text) to service_role;
commit;
