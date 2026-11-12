-- Kalling owner portal. Apply once after 001-003 as postgres.
-- An invited business owner signs in with the invited, confirmed email and sees only their
-- own portal: buyers, document requests, messages and next steps. They never become a firm
-- member, so every existing firm table stays invisible to them.
begin;

create table public.kalling_portals (
 id uuid primary key default gen_random_uuid(), firm_id uuid not null references public.kalling_firms(id),
 company_id text not null check(length(company_id) between 1 and 100),
 business_name text not null check(length(business_name) between 2 and 160), firm_name text not null,
 owner_name text not null check(length(owner_name) between 2 and 120), owner_email text not null check(owner_email~'^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' and length(owner_email)<=254),
 help jsonb not null, welcome text not null default '' check(length(welcome)<=1200),
 status text not null default 'Draft' check(status in ('Draft','Invited','Active','Closed')),
 seller_id uuid references auth.users(id), created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(), invited_at timestamptz, accepted_at timestamptz,
 seller_seen_at timestamptz, firm_seen_at timestamptz
);
create unique index kalling_portals_open_company on public.kalling_portals(firm_id,company_id) where status<>'Closed';
create table kalling_private.portal_invites (
 token_hash text primary key, portal_id uuid not null references public.kalling_portals(id), email text not null,
 created_by uuid not null references auth.users(id), expires_at timestamptz not null default now()+interval '14 days', used_at timestamptz
);
create table public.kalling_portal_buyers (
 id uuid primary key default gen_random_uuid(), portal_id uuid not null references public.kalling_portals(id),
 name text not null check(length(name) between 2 and 160), summary text not null default '' check(length(summary)<=800),
 stage text not null check(stage in ('Introduced','Interested','Under NDA','Reviewing information','Offer made','Not proceeding')),
 updated_at timestamptz not null default now()
);
create table public.kalling_portal_steps (
 id uuid primary key default gen_random_uuid(), portal_id uuid not null references public.kalling_portals(id),
 text text not null check(length(text) between 3 and 300), owner text not null check(owner in ('You','Firm')),
 due text not null default '' check(due='' or due~'^\d{4}-\d{2}-\d{2}$'), done boolean not null default false, position integer not null default 0
);
create table public.kalling_portal_files (
 id uuid primary key default gen_random_uuid(), portal_id uuid not null references public.kalling_portals(id),
 request_id uuid, name text not null check(length(name) between 1 and 200), mime text not null,
 size bigint not null check(size between 1 and 10485760), sha256 text not null check(sha256~'^[0-9a-f]{64}$'),
 object_path text not null unique, status text not null default 'reserved' check(status in ('reserved','stored')),
 uploaded_by uuid not null references auth.users(id), uploader_name text not null, side text not null check(side in ('firm','seller')),
 created_at timestamptz not null default now()
);
create unique index kalling_portal_files_once on public.kalling_portal_files(portal_id,sha256) where status='stored';
create table public.kalling_portal_requests (
 id uuid primary key default gen_random_uuid(), portal_id uuid not null references public.kalling_portals(id),
 title text not null check(length(title) between 3 and 140), needed text not null check(length(needed) between 10 and 1500),
 why text not null check(length(why) between 10 and 1000), sharing text not null check(length(sharing) between 10 and 600),
 contact jsonb not null, due text not null default '' check(due='' or due~'^\d{4}-\d{2}-\d{2}$'),
 status text not null default 'Open' check(status in ('Open','In progress','Submitted','Accepted','Needs changes','Not applicable')),
 seller_note text not null default '' check(length(seller_note)<=2000), review_note text not null default '' check(length(review_note)<=1000),
 file_ids uuid[] not null default '{}', created_at timestamptz not null default now(), updated_at timestamptz not null default now(), submitted_at timestamptz
);
create table public.kalling_portal_messages (
 id uuid primary key default gen_random_uuid(), portal_id uuid not null references public.kalling_portals(id),
 side text not null check(side in ('firm','seller')), author_id uuid not null references auth.users(id), author text not null,
 body text not null check(length(body) between 1 and 4000), created_at timestamptz not null default now()
);
create index kalling_portal_messages_portal on public.kalling_portal_messages(portal_id,created_at);

-- 'firm-write' (owner/admin/analyst), 'firm-read' (viewer), 'seller' (accepted, confirmed, same email) or null.
create function kalling_private.portal_role(p uuid) returns text language sql stable security definer set search_path='' as $$
 select case
  when kalling_private.role_for(x.firm_id) in ('owner','admin','analyst') then 'firm-write'
  when kalling_private.role_for(x.firm_id)='viewer' then 'firm-read'
  when x.status='Active' and x.seller_id=auth.uid() and exists(select 1 from auth.users u where u.id=auth.uid() and lower(u.email)=x.owner_email and u.email_confirmed_at is not null) then 'seller'
 end from public.kalling_portals x where x.id=p
$$;
create function kalling_private.portal_need(p uuid,allowed text[]) returns text language plpgsql security definer set search_path='' as $$
declare r text=kalling_private.portal_role(p); begin
 if auth.uid() is null or r is null or not (r=any(allowed)) then raise exception 'Portal access denied' using errcode='42501'; end if;
 return r;
end $$;
create function kalling_private.actor_name() returns text language sql stable security definer set search_path='' as $$ select coalesce((select email from auth.users where id=auth.uid()),'Unknown') $$;
create function kalling_private.contact(c jsonb,label text) returns jsonb language plpgsql immutable set search_path='' as $$
begin
 if jsonb_typeof(c)<>'object' or length(trim(coalesce(c->>'name','')))<2 or coalesce(c->>'email','')!~'^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception '% needs a name and a valid email address',label; end if;
 return jsonb_strip_nulls(jsonb_build_object('name',left(trim(c->>'name'),120),'email',lower(left(trim(c->>'email'),254)),'phone',nullif(left(trim(coalesce(c->>'phone','')),40),'')));
end $$;

alter table public.kalling_portals enable row level security;
alter table public.kalling_portal_buyers enable row level security;
alter table public.kalling_portal_steps enable row level security;
alter table public.kalling_portal_files enable row level security;
alter table public.kalling_portal_requests enable row level security;
alter table public.kalling_portal_messages enable row level security;
alter table kalling_private.portal_invites enable row level security;
create policy portals_read on public.kalling_portals for select to authenticated using(kalling_private.portal_role(id) is not null);
create policy portal_buyers_read on public.kalling_portal_buyers for select to authenticated using(kalling_private.portal_role(portal_id) is not null);
create policy portal_steps_read on public.kalling_portal_steps for select to authenticated using(kalling_private.portal_role(portal_id) is not null);
create policy portal_files_read on public.kalling_portal_files for select to authenticated using(status='stored' and kalling_private.portal_role(portal_id) is not null);
create policy portal_requests_read on public.kalling_portal_requests for select to authenticated using(kalling_private.portal_role(portal_id) is not null);
create policy portal_messages_read on public.kalling_portal_messages for select to authenticated using(kalling_private.portal_role(portal_id) is not null);
revoke all on public.kalling_portals,public.kalling_portal_buyers,public.kalling_portal_steps,public.kalling_portal_files,public.kalling_portal_requests,public.kalling_portal_messages,kalling_private.portal_invites from public,anon,authenticated;
grant select on public.kalling_portals,public.kalling_portal_buyers,public.kalling_portal_steps,public.kalling_portal_files,public.kalling_portal_requests,public.kalling_portal_messages to authenticated;

-- Private bucket. Objects are written only to a path reserved by the uploader and read only through current portal access.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('kalling-portal','kalling-portal',false,10485760,
 array['application/pdf','image/png','image/jpeg','text/plain','text/csv','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/msword']);
create function kalling_private.can_upload_portal(path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.kalling_portal_files f where f.object_path=path and f.uploaded_by=auth.uid() and f.status='reserved' and f.created_at>now()-interval '1 day' and kalling_private.portal_role(f.portal_id) in ('firm-write','seller'))
$$;
create function kalling_private.can_download_portal(path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.kalling_portal_files f where f.object_path=path and f.status='stored' and kalling_private.portal_role(f.portal_id) is not null)
$$;
create policy kalling_portal_upload on storage.objects for insert to authenticated with check(bucket_id='kalling-portal' and kalling_private.can_upload_portal(name));
create policy kalling_portal_download on storage.objects for select to authenticated using(bucket_id='kalling-portal' and kalling_private.can_download_portal(name));

-- ── Firm team ────────────────────────────────────────────────────────────────────────
create function public.kalling_portal_create(p_firm uuid,p_company text,p_business text,p_owner_name text,p_owner_email text,p_help jsonb,p_welcome text default '') returns uuid language plpgsql security definer set search_path='' as $$
declare p uuid; begin
 perform kalling_private.require_role(p_firm,array['owner','admin','analyst']);
 perform 1 from public.kalling_firms where id=p_firm for update;
 if not exists(select 1 from public.kalling_workspaces w,jsonb_array_elements(w.data->'companies') c where w.firm_id=p_firm and c->>'id'=p_company) then raise exception 'Company not in this firm'; end if;
 if exists(select 1 from public.kalling_portals where firm_id=p_firm and company_id=p_company and status<>'Closed') then raise exception 'This business already has an open owner portal.'; end if;
 if (select count(*) from public.kalling_portals where firm_id=p_firm)>=50 then raise exception 'Fifty owner portals per firm is the pilot limit.'; end if;
 insert into public.kalling_portals(firm_id,company_id,business_name,firm_name,owner_name,owner_email,help,welcome,created_by)
  values(p_firm,p_company,trim(p_business),(select name from public.kalling_firms where id=p_firm),trim(p_owner_name),lower(trim(p_owner_email)),kalling_private.contact(p_help,'The help contact'),left(coalesce(trim(p_welcome),''),1200),auth.uid()) returning id into p;
 insert into public.kalling_audit(firm_id,actor_id,event,detail) values(p_firm,auth.uid(),'portal.created',jsonb_build_object('portal_id',p,'company_id',p_company));
 return p;
end $$;
create function public.kalling_portal_update(p_portal uuid,p_patch jsonb) returns void language plpgsql security definer set search_path='' as $$
declare x public.kalling_portals; e text; begin
 perform kalling_private.portal_need(p_portal,array['firm-write']);
 select * into x from public.kalling_portals where id=p_portal for update;
 e=lower(trim(coalesce(p_patch->>'ownerEmail',x.owner_email)));
 update public.kalling_portals set business_name=coalesce(trim(p_patch->>'businessName'),business_name),owner_name=coalesce(trim(p_patch->>'ownerName'),owner_name),owner_email=e,
  welcome=left(coalesce(p_patch->>'welcome',welcome),1200),help=case when p_patch ? 'help' then kalling_private.contact(p_patch->'help','The help contact') else help end,
  -- A new owner address revokes the earlier invitation and the earlier account's access.
  status=case when coalesce((p_patch->>'close')::boolean,false) then 'Closed' when e<>x.owner_email and x.status<>'Closed' then 'Draft' else status end,
  seller_id=case when e<>x.owner_email then null else seller_id end,accepted_at=case when e<>x.owner_email then null else accepted_at end where id=p_portal;
 if e<>x.owner_email or coalesce((p_patch->>'close')::boolean,false) then update kalling_private.portal_invites set used_at=now() where portal_id=p_portal and used_at is null; end if;
 insert into public.kalling_audit(firm_id,actor_id,event,detail) values(x.firm_id,auth.uid(),'portal.updated',jsonb_build_object('portal_id',p_portal,'owner_changed',e<>x.owner_email));
end $$;
create function public.kalling_portal_invite(p_portal uuid) returns text language plpgsql security definer set search_path='' as $$
declare x public.kalling_portals; token text; begin
 perform kalling_private.portal_need(p_portal,array['firm-write']);
 select * into x from public.kalling_portals where id=p_portal for update;
 if x.status='Closed' then raise exception 'This portal is closed.'; end if;
 update kalling_private.portal_invites set used_at=now() where portal_id=p_portal and used_at is null;
 token=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
 insert into kalling_private.portal_invites(token_hash,portal_id,email,created_by) values(encode(sha256(convert_to(token,'UTF8')),'hex'),p_portal,x.owner_email,auth.uid());
 update public.kalling_portals set status=case when status='Draft' then 'Invited' else status end,invited_at=now() where id=p_portal;
 insert into public.kalling_audit(firm_id,actor_id,event,detail) values(x.firm_id,auth.uid(),'portal.invited',jsonb_build_object('portal_id',p_portal));
 return token;
end $$;
create function public.kalling_portal_save_buyer(p_portal uuid,p_buyer jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare b uuid=nullif(p_buyer->>'id','')::uuid; begin
 perform kalling_private.portal_need(p_portal,array['firm-write']);
 if b is null then
  if (select count(*) from public.kalling_portal_buyers where portal_id=p_portal)>=20 then raise exception 'Twenty buyers per portal is the pilot limit.'; end if;
  insert into public.kalling_portal_buyers(portal_id,name,summary,stage) values(p_portal,trim(p_buyer->>'name'),left(coalesce(trim(p_buyer->>'summary'),''),800),p_buyer->>'stage') returning id into b;
 else update public.kalling_portal_buyers set name=trim(p_buyer->>'name'),summary=left(coalesce(trim(p_buyer->>'summary'),''),800),stage=p_buyer->>'stage',updated_at=now() where id=b and portal_id=p_portal;
  if not found then raise exception 'Buyer not found'; end if; end if;
 return b;
end $$;
create function public.kalling_portal_remove_buyer(p_portal uuid,p_buyer uuid) returns void language plpgsql security definer set search_path='' as $$
begin perform kalling_private.portal_need(p_portal,array['firm-write']); delete from public.kalling_portal_buyers where id=p_buyer and portal_id=p_portal; end $$;
create function public.kalling_portal_save_steps(p_portal uuid,p_steps jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 perform kalling_private.portal_need(p_portal,array['firm-write']);
 if jsonb_typeof(p_steps)<>'array' or jsonb_array_length(p_steps)>12 then raise exception 'Keep next steps to twelve or fewer.'; end if;
 delete from public.kalling_portal_steps where portal_id=p_portal;
 insert into public.kalling_portal_steps(portal_id,text,owner,due,done,position)
  select p_portal,left(trim(s->>'text'),300),case when s->>'owner'='You' then 'You' else 'Firm' end,coalesce(s->>'due',''),coalesce((s->>'done')::boolean,false),n
  from jsonb_array_elements(p_steps) with ordinality as t(s,n) where length(trim(coalesce(s->>'text','')))>=3;
end $$;
create function public.kalling_portal_save_request(p_portal uuid,p_request jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare r uuid=nullif(p_request->>'id','')::uuid; c jsonb=kalling_private.contact(p_request->'contact','The request contact'); begin
 perform kalling_private.portal_need(p_portal,array['firm-write']);
 if r is null then
  if (select count(*) from public.kalling_portal_requests where portal_id=p_portal)>=40 then raise exception 'Forty requests per portal is the pilot limit.'; end if;
  insert into public.kalling_portal_requests(portal_id,title,needed,why,sharing,contact,due) values(p_portal,trim(p_request->>'title'),trim(p_request->>'needed'),trim(p_request->>'why'),trim(p_request->>'sharing'),c,coalesce(p_request->>'due','')) returning id into r;
 else update public.kalling_portal_requests set title=trim(p_request->>'title'),needed=trim(p_request->>'needed'),why=trim(p_request->>'why'),sharing=trim(p_request->>'sharing'),contact=c,due=coalesce(p_request->>'due',''),updated_at=now() where id=r and portal_id=p_portal;
  if not found then raise exception 'Request not found'; end if; end if;
 return r;
end $$;
create function public.kalling_portal_review(p_request uuid,p_status text,p_note text) returns void language plpgsql security definer set search_path='' as $$
declare r public.kalling_portal_requests; begin
 select * into r from public.kalling_portal_requests where id=p_request for update;
 perform kalling_private.portal_need(r.portal_id,array['firm-write']);
 if p_status not in ('Accepted','Needs changes','Not applicable','Open') then raise exception 'Unknown review outcome'; end if;
 if p_status='Needs changes' and length(trim(coalesce(p_note,'')))<5 then raise exception 'Tell the owner what needs to change.'; end if;
 update public.kalling_portal_requests set status=p_status,review_note=left(coalesce(trim(p_note),''),1000),updated_at=now() where id=p_request;
end $$;

-- ── Invited owner ────────────────────────────────────────────────────────────────────
create function public.kalling_portal_accept(p_token text) returns uuid language plpgsql security definer set search_path='' as $$
declare i kalling_private.portal_invites; mail text; begin
 if auth.uid() is null then raise exception 'Sign in first' using errcode='42501'; end if;
 select lower(email) into mail from auth.users where id=auth.uid() and email_confirmed_at is not null;
 if mail is null then raise exception 'Confirm your email first' using errcode='42501'; end if;
 select * into i from kalling_private.portal_invites where token_hash=encode(sha256(convert_to(coalesce(p_token,''),'UTF8')),'hex') and used_at is null and expires_at>now() for update;
 if i.portal_id is null then raise exception 'This invitation link is invalid or has expired. Ask your contact for a new one.' using errcode='42501'; end if;
 if i.email<>mail then raise exception 'This invitation was sent to a different email address. Sign in with the address it was sent to.' using errcode='42501'; end if;
 update kalling_private.portal_invites set used_at=now() where token_hash=i.token_hash;
 update public.kalling_portals set status='Active',seller_id=auth.uid(),accepted_at=now() where id=i.portal_id and status<>'Closed' and owner_email=mail;
 if not found then raise exception 'This portal is no longer available.' using errcode='42501'; end if;
 insert into public.kalling_audit(firm_id,actor_id,event,detail) select firm_id,auth.uid(),'portal.accepted',jsonb_build_object('portal_id',id) from public.kalling_portals where id=i.portal_id;
 return i.portal_id;
end $$;
create function kalling_private.seller_request(p_request uuid) returns public.kalling_portal_requests language plpgsql security definer set search_path='' as $$
declare r public.kalling_portal_requests; begin
 select * into r from public.kalling_portal_requests where id=p_request for update;
 perform kalling_private.portal_need(r.portal_id,array['seller']);
 if r.status in ('Accepted','Not applicable') then raise exception 'This request is already complete.'; end if;
 return r;
end $$;
create function public.kalling_portal_seller_note(p_request uuid,p_note text) returns void language plpgsql security definer set search_path='' as $$
declare r public.kalling_portal_requests=kalling_private.seller_request(p_request); n text=left(trim(coalesce(p_note,'')),2000); begin
 update public.kalling_portal_requests set seller_note=n,updated_at=now(),
  status=case when status in ('Open','Needs changes') and (n<>'' or cardinality(file_ids)>0) then 'In progress' else status end where id=r.id;
end $$;
create function public.kalling_portal_submit(p_request uuid) returns void language plpgsql security definer set search_path='' as $$
declare r public.kalling_portal_requests=kalling_private.seller_request(p_request); begin
 if cardinality(r.file_ids)=0 and length(r.seller_note)<5 then raise exception 'Add a document, or a note explaining why you cannot provide one, before sending.'; end if;
 update public.kalling_portal_requests set status='Submitted',submitted_at=now(),updated_at=now() where id=r.id;
 insert into public.kalling_audit(firm_id,actor_id,event,detail) select firm_id,auth.uid(),'portal.request_submitted',jsonb_build_object('portal_id',id,'request_id',r.id) from public.kalling_portals where id=r.portal_id;
end $$;
create function public.kalling_portal_link(p_request uuid,p_file uuid) returns void language plpgsql security definer set search_path='' as $$
declare r public.kalling_portal_requests; begin
 select * into r from public.kalling_portal_requests where id=p_request for update;
 if kalling_private.portal_need(r.portal_id,array['seller','firm-write'])='seller' and r.status in ('Accepted','Not applicable') then raise exception 'This request is already complete.'; end if;
 if not exists(select 1 from public.kalling_portal_files where id=p_file and portal_id=r.portal_id and status='stored') then raise exception 'That document is not available in this portal.'; end if;
 update public.kalling_portal_requests set file_ids=case when p_file=any(file_ids) then file_ids else file_ids||p_file end,updated_at=now(),
  status=case when status in ('Open','Needs changes') then 'In progress' else status end where id=r.id;
end $$;
create function public.kalling_portal_unlink(p_request uuid,p_file uuid) returns void language plpgsql security definer set search_path='' as $$
declare r public.kalling_portal_requests=kalling_private.seller_request(p_request); begin
 if r.status='Submitted' then raise exception 'This request was sent for review. Message your contact to change it.'; end if;
 update public.kalling_portal_requests set file_ids=array_remove(file_ids,p_file),updated_at=now() where id=r.id;
end $$;
-- Reservation: dedupes identical bytes, resumes an unfinished upload, and enforces quotas.
create function public.kalling_portal_reserve_file(p_request uuid,p_name text,p_mime text,p_size bigint,p_sha256 text) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.kalling_portal_requests; f public.kalling_portal_files; side text; begin
 select * into r from public.kalling_portal_requests where id=p_request;
 side=kalling_private.portal_need(r.portal_id,array['seller','firm-write']);
 if side='seller' and r.status in ('Accepted','Not applicable') then raise exception 'This request is already complete.'; end if;
 if coalesce(p_sha256,'')!~'^[0-9a-f]{64}$' then raise exception 'File fingerprint missing'; end if;
 perform 1 from public.kalling_portals where id=r.portal_id for update;
 select * into f from public.kalling_portal_files where portal_id=r.portal_id and sha256=p_sha256 and status='stored';
 if f.id is not null then perform public.kalling_portal_link(p_request,f.id);
  return jsonb_build_object('file',to_jsonb(f)-'object_path'-'uploaded_by','duplicate',true); end if;
 select * into f from public.kalling_portal_files where portal_id=r.portal_id and sha256=p_sha256 and status='reserved' and uploaded_by=auth.uid() and created_at>now()-interval '1 day' order by created_at desc limit 1;
 if f.id is null then
  if p_size not between 1 and 10485760 then raise exception 'Each file can be up to 10 MB. Split larger files or contact your help contact.'; end if;
  if p_mime not in ('application/pdf','image/png','image/jpeg','text/plain','text/csv','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/msword') or p_name!~*'[.](pdf|png|jpe?g|txt|csv|xlsx?|docx?)$' then raise exception 'Use PDF, image, Word, Excel, CSV or text files.'; end if;
  if (select count(*) from public.kalling_portal_files where portal_id=r.portal_id)>=100 then raise exception 'This portal has reached its 100-file limit. Contact your help contact.'; end if;
  if (select coalesce(sum(size),0) from public.kalling_portal_files where portal_id=r.portal_id)+p_size>209715200 then raise exception 'This portal has reached its storage limit. Contact your help contact.'; end if;
  insert into public.kalling_portal_files(portal_id,request_id,name,mime,size,sha256,object_path,uploaded_by,uploader_name,side)
   values(r.portal_id,p_request,left(trim(p_name),200),p_mime,p_size,p_sha256,r.portal_id::text||'/'||gen_random_uuid()::text||'/'||gen_random_uuid()::text,auth.uid(),kalling_private.actor_name(),case when side='seller' then 'seller' else 'firm' end) returning * into f;
 end if;
 return jsonb_build_object('file',to_jsonb(f)-'uploaded_by','duplicate',false,'uploaded',exists(select 1 from storage.objects o where o.bucket_id='kalling-portal' and o.name=f.object_path));
end $$;
create function public.kalling_portal_finish_file(p_file uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare f public.kalling_portal_files; bytes bigint; mime text; existing uuid; begin
 select * into f from public.kalling_portal_files where id=p_file for update;
 if f.id is null or f.uploaded_by<>auth.uid() then raise exception 'Upload unavailable' using errcode='42501'; end if;
 perform kalling_private.portal_need(f.portal_id,array['seller','firm-write']);
 if f.status='reserved' then
  select (metadata->>'size')::bigint,metadata->>'mimetype' into bytes,mime from storage.objects where bucket_id='kalling-portal' and name=f.object_path;
  if bytes is distinct from f.size or mime is distinct from f.mime then raise exception 'The uploaded file did not arrive completely. Try uploading it again.'; end if;
  select id into existing from public.kalling_portal_files where portal_id=f.portal_id and sha256=f.sha256 and status='stored';
  if existing is not null then f.id=existing; else update public.kalling_portal_files set status='stored' where id=f.id; end if;
 end if;
 if f.request_id is not null then perform public.kalling_portal_link(f.request_id,f.id); end if;
 insert into public.kalling_audit(firm_id,actor_id,event,detail) select firm_id,auth.uid(),'portal.file_stored',jsonb_build_object('portal_id',id,'file_id',f.id) from public.kalling_portals where id=f.portal_id;
 return (select to_jsonb(x)-'object_path'-'uploaded_by' from public.kalling_portal_files x where id=f.id);
end $$;
create function public.kalling_portal_file_path(p_file uuid) returns text language plpgsql security definer set search_path='' as $$
declare f public.kalling_portal_files; begin
 select * into f from public.kalling_portal_files where id=p_file and status='stored';
 perform kalling_private.portal_need(f.portal_id,array['seller','firm-write','firm-read']);
 return f.object_path;
end $$;

-- ── Both sides ───────────────────────────────────────────────────────────────────────
create function public.kalling_portal_message(p_portal uuid,p_body text) returns uuid language plpgsql security definer set search_path='' as $$
declare side text=kalling_private.portal_need(p_portal,array['seller','firm-write']); m uuid; begin
 if length(trim(coalesce(p_body,''))) not between 1 and 4000 then raise exception 'Messages can be up to 4,000 characters.'; end if;
 if (select count(*) from public.kalling_portal_messages where portal_id=p_portal)>=1000 then raise exception 'This conversation reached the pilot limit. Contact your help contact.'; end if;
 insert into public.kalling_portal_messages(portal_id,side,author_id,author,body) values(p_portal,case when side='seller' then 'seller' else 'firm' end,auth.uid(),
  case when side='seller' then (select owner_name from public.kalling_portals where id=p_portal) else kalling_private.actor_name() end,trim(p_body)) returning id into m;
 return m;
end $$;
create function public.kalling_portal_seen(p_portal uuid) returns void language plpgsql security definer set search_path='' as $$
declare side text=kalling_private.portal_need(p_portal,array['seller','firm-write','firm-read']); begin
 if side='seller' then update public.kalling_portals set seller_seen_at=now() where id=p_portal; else update public.kalling_portals set firm_seen_at=now() where id=p_portal; end if;
end $$;
-- Who can open documents in this portal: the owner and current members of the firm.
create function public.kalling_portal_access(p_portal uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare x public.kalling_portals; begin
 perform kalling_private.portal_need(p_portal,array['seller','firm-write','firm-read']);
 select * into x from public.kalling_portals where id=p_portal;
 return jsonb_build_object('team',coalesce((select jsonb_agg(lower(u.email) order by u.email) from public.kalling_members m join auth.users u on u.id=m.user_id where m.firm_id=x.firm_id and m.active),'[]'::jsonb),
  'seller',case when x.status='Active' then jsonb_build_array(x.owner_email) else '[]'::jsonb end);
end $$;

revoke all on all functions in schema kalling_private from public,anon,authenticated;
grant execute on function kalling_private.role_for(uuid),kalling_private.can_upload(text),kalling_private.can_download(text),kalling_private.portal_role(uuid),kalling_private.can_upload_portal(text),kalling_private.can_download_portal(text) to authenticated;
revoke all on function public.kalling_portal_create(uuid,text,text,text,text,jsonb,text),public.kalling_portal_update(uuid,jsonb),public.kalling_portal_invite(uuid),public.kalling_portal_save_buyer(uuid,jsonb),public.kalling_portal_remove_buyer(uuid,uuid),public.kalling_portal_save_steps(uuid,jsonb),public.kalling_portal_save_request(uuid,jsonb),public.kalling_portal_review(uuid,text,text),public.kalling_portal_accept(text),public.kalling_portal_seller_note(uuid,text),public.kalling_portal_submit(uuid),public.kalling_portal_link(uuid,uuid),public.kalling_portal_unlink(uuid,uuid),public.kalling_portal_reserve_file(uuid,text,text,bigint,text),public.kalling_portal_finish_file(uuid),public.kalling_portal_file_path(uuid),public.kalling_portal_message(uuid,text),public.kalling_portal_seen(uuid),public.kalling_portal_access(uuid) from public,anon;
grant execute on function public.kalling_portal_create(uuid,text,text,text,text,jsonb,text),public.kalling_portal_update(uuid,jsonb),public.kalling_portal_invite(uuid),public.kalling_portal_save_buyer(uuid,jsonb),public.kalling_portal_remove_buyer(uuid,uuid),public.kalling_portal_save_steps(uuid,jsonb),public.kalling_portal_save_request(uuid,jsonb),public.kalling_portal_review(uuid,text,text),public.kalling_portal_accept(text),public.kalling_portal_seller_note(uuid,text),public.kalling_portal_submit(uuid),public.kalling_portal_link(uuid,uuid),public.kalling_portal_unlink(uuid,uuid),public.kalling_portal_reserve_file(uuid,text,text,bigint,text),public.kalling_portal_finish_file(uuid),public.kalling_portal_file_path(uuid),public.kalling_portal_message(uuid,text),public.kalling_portal_seen(uuid),public.kalling_portal_access(uuid) to authenticated;
commit;
