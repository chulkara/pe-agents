-- Buyer evidence stays separate from seller documents and per-listing NDA access.
begin;
alter table kalling_private.brokerage_settings add column verification_days integer not null default 90 check(verification_days between 1 and 365);
create function public.kalling_verification_policy(p_days integer default null) returns integer language plpgsql security definer set search_path='' as $$
begin
 perform kalling_private.need_advisor();
 if p_days is not null then
  if kalling_private.advisor_role() not in ('owner','admin') then raise exception 'Only a firm owner or administrator can change this policy.' using errcode='42501';end if;
  update kalling_private.brokerage_settings set verification_days=p_days where id;
 end if;
 return (select verification_days from kalling_private.brokerage_settings where id);
end $$;
revoke all on function public.kalling_verification_policy(integer) from public,anon;
grant execute on function public.kalling_verification_policy(integer) to authenticated;

create table public.kalling_verification_submissions(
 id uuid primary key default gen_random_uuid(),buyer_id uuid not null references public.kalling_buyers(id),version int not null check(version>0),
 status text not null default 'Draft' check(status in ('Draft','Submitted','In review','Changes needed','Verified','Withdrawn','Revoked')),
 kind text not null check(kind in ('Proof of funds','Lender pre-qualification')),entity text not null check(length(entity) between 2 and 160),
 document_date date not null,valid_until date,explanation text not null default '' check(length(explanation)<=1000),buyer_message text not null default '',private_note text not null default '',
 review jsonb,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),submitted_at timestamptz,
 unique(buyer_id,version)
);
create table public.kalling_verification_files(
 id uuid primary key default gen_random_uuid(),submission_id uuid not null references public.kalling_verification_submissions(id),name text not null check(length(name) between 1 and 200),
 mime text not null check(mime in ('application/pdf','image/png','image/jpeg')),size bigint not null check(size between 1 and 10485760),sha256 text not null check(sha256~'^[0-9a-f]{64}$'),
 object_path text not null unique,status text not null default 'reserved' check(status in ('reserved','stored')),attested_at timestamptz,created_at timestamptz not null default now(),unique(submission_id,sha256)
);
create table kalling_private.verification_events(id bigint generated always as identity primary key,submission_id uuid not null references public.kalling_verification_submissions(id),file_id uuid,actor_id uuid not null references auth.users(id),action text not null,at timestamptz not null default now());
create table kalling_private.verification_tickets(id uuid primary key default gen_random_uuid(),user_id uuid not null,file_id uuid not null references public.kalling_verification_files(id),event_id bigint not null references kalling_private.verification_events(id),created_at timestamptz not null default now());
create index verification_ticket_file on kalling_private.verification_tickets(file_id,user_id,created_at);
alter table public.kalling_verification_submissions enable row level security;
alter table public.kalling_verification_files enable row level security;
alter table kalling_private.verification_events enable row level security;
alter table kalling_private.verification_tickets enable row level security;
-- Reads use purpose-specific RPC projections. Buyers never receive private_note or object paths in lists.
revoke all on public.kalling_verification_submissions,public.kalling_verification_files,kalling_private.verification_events,kalling_private.verification_tickets from public,anon,authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('kalling-buyer-proof','kalling-buyer-proof',false,10485760,array['application/pdf','image/png','image/jpeg']);

create function kalling_private.verification_allowed(p_buyer uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (exists(select 1 from public.kalling_buyers b where b.id=p_buyer and b.user_id=auth.uid()) or kalling_private.advisor_role() in ('owner','admin','analyst'))
$$;
create function kalling_private.verification_json(v public.kalling_verification_submissions,p_private boolean) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',v.id,'buyerId',v.buyer_id,'version',v.version,'status',v.status,'kind',v.kind,'entity',v.entity,'documentDate',v.document_date,'validUntil',coalesce(v.valid_until::text,''),'explanation',v.explanation,'buyerMessage',v.buyer_message,'review',v.review,'createdAt',v.created_at,'updatedAt',v.updated_at,'submittedAt',v.submitted_at,
  'files',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'submissionId',f.submission_id,'name',f.name,'mime',f.mime,'size',f.size,'sha256',f.sha256,'status',f.status,'createdAt',f.created_at) order by f.created_at) from public.kalling_verification_files f where f.submission_id=v.id),'[]'))||case when p_private then jsonb_build_object('privateNote',v.private_note) else '{}'::jsonb end
$$;
create function public.kalling_verification_list(p_buyer uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare b uuid=p_buyer; adv boolean=coalesce(kalling_private.advisor_role() in ('owner','admin','analyst'),false);begin
 if not adv then select id into b from public.kalling_buyers where user_id=auth.uid();if b is null or p_buyer is not null and p_buyer<>b then raise exception 'Verification access denied.' using errcode='42501';end if;end if;
 if auth.uid() is null then raise exception 'Verification access denied.' using errcode='42501';end if;
 return coalesce((select jsonb_agg(kalling_private.verification_json(v,adv) order by v.created_at desc,v.version desc) from public.kalling_verification_submissions v where b is null or v.buyer_id=b),'[]');
end $$;
create function public.kalling_verification_save(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.kalling_buyers=kalling_private.my_buyer();old public.kalling_verification_submissions;v public.kalling_verification_submissions;d date=(p->>'documentDate')::date;e date=nullif(p->>'validUntil','')::date;begin
 if b.id is null then raise exception 'Create a buyer profile first.' using errcode='42501';end if;
 perform 1 from public.kalling_buyers where id=b.id for update;
 if d is null or d>current_date or e<d then raise exception 'Enter a valid document and validity date.';end if;
 select * into old from public.kalling_verification_submissions where buyer_id=b.id order by version desc limit 1;
 if nullif(p->>'id','') is not null then
  if old.id::text is distinct from (p->>'id') or old.status<>'Draft' then raise exception 'This version is frozen. Prepare a replacement.';end if;
  update public.kalling_verification_submissions set kind=p->>'kind',entity=trim(p->>'entity'),document_date=d,valid_until=e,explanation=left(coalesce(p->>'explanation',''),1000),updated_at=now() where id=old.id returning * into v;
 else
  if (select count(*) from public.kalling_verification_submissions where buyer_id=b.id)>=40 then raise exception 'Contact Kalling before adding more evidence versions.';end if;
  insert into public.kalling_verification_submissions(buyer_id,version,kind,entity,document_date,valid_until,explanation) values(b.id,coalesce(old.version,0)+1,p->>'kind',trim(p->>'entity'),d,e,left(coalesce(p->>'explanation',''),1000)) returning * into v;
 end if;
 insert into kalling_private.verification_events(submission_id,actor_id,action) values(v.id,auth.uid(),'Draft saved');return kalling_private.verification_json(v,false);
end $$;
create function public.kalling_verification_reserve(p_submission uuid,p_name text,p_mime text,p_size bigint,p_sha text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.kalling_verification_submissions;f public.kalling_verification_files;begin
 select * into v from public.kalling_verification_submissions where id=p_submission for update;
 if v.id is null or v.buyer_id is distinct from (kalling_private.my_buyer()).id or v.status<>'Draft' or exists(select 1 from public.kalling_verification_submissions where buyer_id=v.buyer_id and version>v.version) then raise exception 'Open your current draft.' using errcode='42501';end if;
 if p_name!~*'[.](pdf|png|jpe?g)$' or (p_mime='application/pdf' and p_name!~*'[.]pdf$') or (p_mime='image/png' and p_name!~*'[.]png$') or (p_mime='image/jpeg' and p_name!~*'[.]jpe?g$') then raise exception 'Use PDF, PNG or JPEG evidence.';end if;
 select * into f from public.kalling_verification_files where submission_id=v.id and sha256=p_sha;
 if f.id is null then
  if (select count(*) from public.kalling_verification_files where submission_id=v.id)>=3 then raise exception 'Use up to three documents per submission.';end if;
  insert into public.kalling_verification_files(submission_id,name,mime,size,sha256,object_path) values(v.id,left(p_name,200),p_mime,p_size,p_sha,v.buyer_id::text||'/'||gen_random_uuid()::text) returning * into f;
 end if;
 return jsonb_build_object('id',f.id,'path',f.object_path,'stored',f.status='stored');
end $$;
create function public.kalling_verification_change(p_submission uuid,p_action text,p jsonb default '{}') returns void language plpgsql security definer set search_path='' as $$
declare v public.kalling_verification_submissions;u date=nullif(p->>'until','')::date;r jsonb;begin
 select * into v from public.kalling_verification_submissions where id=p_submission for update;
 if v.id is null or not kalling_private.verification_allowed(v.buyer_id) then raise exception 'Verification access denied.' using errcode='42501';end if;
 if exists(select 1 from public.kalling_verification_submissions where buyer_id=v.buyer_id and version>v.version) then raise exception 'Open the current version.';end if;
 if p_action in ('Submit','Withdraw') then
  if v.buyer_id is distinct from (kalling_private.my_buyer()).id then raise exception 'Only the buyer can submit or withdraw.' using errcode='42501';end if;
  if p_action='Submit' then
   if v.status<>'Draft' or not exists(select 1 from public.kalling_verification_files where submission_id=v.id and status='stored') or exists(select 1 from public.kalling_verification_files where submission_id=v.id and status<>'stored') then raise exception 'Wait for validated uploads before submitting.';end if;
  end if;
  update public.kalling_verification_submissions set status=case when p_action='Submit' then 'Submitted' else 'Withdrawn' end,submitted_at=case when p_action='Submit' then now() else submitted_at end,updated_at=now() where id=v.id;
 else
  perform kalling_private.need_advisor();
  if p_action not in ('In review','Changes needed','Verified','Revoked') or v.status not in ('Submitted','In review','Changes needed','Verified') then raise exception 'This submission is not available for review.';end if;
  if p_action='Revoked' and v.status<>'Verified' then raise exception 'Only an existing verification can be revoked.';end if;
  if p_action in ('Changes needed','Revoked') and length(trim(coalesce(p->>'message','')))<5 then raise exception 'Add an explanation for the buyer.';end if;
  r=v.review;
  if p_action='Verified' then
   if coalesce((p->>'reviewed')::boolean,false) is not true or coalesce((select array_agg(x::uuid order by x::uuid) from jsonb_array_elements_text(p->'fileIds') x),'{}') is distinct from (select array_agg(id order by id) from public.kalling_verification_files where submission_id=v.id) then raise exception 'Confirm review of the exact submitted documents.';end if;
   if not exists(select 1 from public.kalling_verification_files where submission_id=v.id and status='stored') or exists(select 1 from public.kalling_verification_files where submission_id=v.id and status<>'stored') then raise exception 'Review a validated file first.';end if;
   if u is null or u<current_date or u>current_date+(select verification_days from kalling_private.brokerage_settings where id) or u>v.valid_until then raise exception 'Use a review-until date within the freshness policy and document validity.';end if;
   r=jsonb_build_object('by',kalling_private.actor_name(),'at',now(),'until',u,'fileIds',(select jsonb_agg(id) from public.kalling_verification_files where submission_id=v.id));
  end if;
  update public.kalling_verification_submissions set status=p_action,buyer_message=left(coalesce(p->>'message',''),1000),private_note=left(coalesce(p->>'privateNote',''),1000),review=r,updated_at=now() where id=v.id;
 end if;
 insert into kalling_private.verification_events(submission_id,actor_id,action) values(v.id,auth.uid(),p_action);
end $$;
create function kalling_private.verification_badge(p_buyer uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce((select jsonb_strip_nulls(jsonb_build_object('status',case when v.status in ('Withdrawn','Revoked') then v.status when v.status<>'Verified' or v.review is null then 'Needs review' when least((v.review->>'until')::date,v.valid_until)<current_date then 'Expired' else 'Verified' end,'reviewedAt',v.review->>'at','until',least((v.review->>'until')::date,v.valid_until))) from public.kalling_verification_submissions v where v.buyer_id=p_buyer order by v.version desc limit 1),'{"status":"Not reviewed"}')
$$;
create function public.kalling_verification_open(p_file uuid) returns text language plpgsql security definer set search_path='' as $$
declare f public.kalling_verification_files;v public.kalling_verification_submissions;e bigint;begin
 select * into f from public.kalling_verification_files where id=p_file;select * into v from public.kalling_verification_submissions where id=f.submission_id;
 if f.id is null or not kalling_private.verification_allowed(v.buyer_id) then raise exception 'Document access denied.' using errcode='42501';end if;
 insert into kalling_private.verification_events(submission_id,file_id,actor_id,action) values(v.id,f.id,auth.uid(),'Document opened') returning id into e;
 insert into kalling_private.verification_tickets(user_id,file_id,event_id) values(auth.uid(),f.id,e);return f.object_path;
end $$;
create function public.kalling_verification_prepare_validation(p_file uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare f public.kalling_verification_files;v public.kalling_verification_submissions;path text;begin
 select * into f from public.kalling_verification_files where id=p_file;select * into v from public.kalling_verification_submissions where id=f.submission_id;
 if v.buyer_id is distinct from (kalling_private.my_buyer()).id or v.status<>'Draft' or exists(select 1 from public.kalling_verification_submissions where buyer_id=v.buyer_id and version>v.version) then raise exception 'Open your current draft.' using errcode='42501';end if;
 path=public.kalling_verification_open(p_file);
 return jsonb_build_object('id',f.id,'path',path,'name',f.name,'mime',f.mime,'size',f.size,'sha256',f.sha256);
end $$;
-- Only the server-side byte validator may attest to contents. Never grant this to a buyer/advisor.
create function public.kalling_verification_attest(p_file uuid,p_user uuid,p_sha text,p_size bigint,p_mime text) returns void language plpgsql security definer set search_path='' as $$
begin
 update public.kalling_verification_files f set status='stored',attested_at=now() from public.kalling_verification_submissions v,public.kalling_buyers b
 where f.id=p_file and f.submission_id=v.id and v.buyer_id=b.id and b.user_id=p_user and v.status='Draft' and f.sha256=p_sha and f.size=p_size and f.mime=p_mime
 and not exists(select 1 from public.kalling_verification_submissions n where n.buyer_id=b.id and n.version>v.version)
 and exists(select 1 from storage.objects o where o.bucket_id='kalling-buyer-proof' and o.name=f.object_path and (o.metadata->>'size')::bigint=f.size and o.metadata->>'mimetype'=f.mime);
 if not found then raise exception 'File validation did not match the current reservation.';end if;
end $$;
create function kalling_private.verification_storage_ok(p_path text,p_upload boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.kalling_verification_files f join public.kalling_verification_submissions v on v.id=f.submission_id join public.kalling_buyers b on b.id=v.buyer_id
 where f.object_path=p_path and case when p_upload then b.user_id=auth.uid() and f.status='reserved' and v.status='Draft' and not exists(select 1 from public.kalling_verification_submissions n where n.buyer_id=b.id and n.version>v.version)
 else kalling_private.verification_allowed(b.id) and (storage.allow_only_operation('object.get_authenticated_info') and b.user_id=auth.uid() or storage.allow_only_operation('object.get_authenticated') and exists(select 1 from kalling_private.verification_tickets t join kalling_private.verification_events e on e.id=t.event_id where t.file_id=f.id and t.user_id=auth.uid() and t.created_at>now()-interval '2 minutes' and e.actor_id=auth.uid() and e.file_id=f.id)) end)
$$;
create policy buyer_proof_upload on storage.objects for insert to authenticated with check(bucket_id='kalling-buyer-proof' and kalling_private.verification_storage_ok(name,true));
create policy buyer_proof_read on storage.objects for select to authenticated using(bucket_id='kalling-buyer-proof' and kalling_private.verification_storage_ok(name,false));

-- Labels are assigned once per listing/buyer and kept after access is declined or withdrawn.
alter table public.kalling_access add column label_no integer;
with ranked as(select id,dense_rank() over(partition by listing_id order by created_at,id)::int n from public.kalling_access where status='Approved') update public.kalling_access a set label_no=r.n from ranked r where r.id=a.id;
create function kalling_private.assign_buyer_label() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='Approved' and new.label_no is null then
  perform 1 from public.kalling_listings where id=new.listing_id for update;
  select label_no into new.label_no from public.kalling_access where listing_id=new.listing_id and buyer_id=new.buyer_id and label_no is not null order by created_at limit 1;
  if new.label_no is null then select coalesce(max(label_no),0)+1 into new.label_no from public.kalling_access where listing_id=new.listing_id;end if;
 end if;return new;
end $$;
create trigger kalling_access_label before insert or update of status on public.kalling_access for each row execute function kalling_private.assign_buyer_label();
create or replace function kalling_private.dataroom_label(p_listing uuid,p_buyer uuid) returns text language sql stable security definer set search_path='' as $$
 select 'Buyer '||coalesce((select label_no::text from public.kalling_access where listing_id=p_listing and buyer_id=p_buyer and label_no is not null order by created_at limit 1),'?')||', '||lower((select type from public.kalling_buyers where id=p_buyer))
$$;
create function public.kalling_portal_buyer_badges(p_portal uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.kalling_portals;begin
 perform kalling_private.portal_need(p_portal,array['seller','firm-write','firm-read']);select * into p from public.kalling_portals where id=p_portal;
 return coalesce((select jsonb_object_agg(label,badge) from(select distinct kalling_private.dataroom_label(l.id,a.buyer_id) label,kalling_private.verification_badge(a.buyer_id) badge from public.kalling_listings l join public.kalling_listing_private lp on lp.listing_id=l.id join public.kalling_access a on a.listing_id=l.id where lp.company_id=p.company_id and p.firm_id=kalling_private.house() and a.label_no is not null) x),'{}');
end $$;
-- Legacy Verified status is a label only. No RPC can manufacture evidence-backed verification.
create or replace function public.kalling_buyer_vet(p_buyer uuid,p_status text,p_note text) returns void language plpgsql security definer set search_path='' as $$
begin perform kalling_private.need_advisor();if p_status='Verified' then raise exception 'Review uploaded financing evidence to verify a buyer.';end if;
 update public.kalling_buyers set status=p_status,advisor_note=left(coalesce(p_note,''),2000) where id=p_buyer;end $$;
revoke all on function kalling_private.verification_allowed(uuid),kalling_private.verification_json(public.kalling_verification_submissions,boolean),kalling_private.verification_badge(uuid),kalling_private.assign_buyer_label() from public,anon,authenticated;
revoke all on function kalling_private.verification_storage_ok(text,boolean) from public,anon;
grant execute on function kalling_private.verification_storage_ok(text,boolean) to authenticated;
revoke all on function public.kalling_verification_list(uuid),public.kalling_verification_save(jsonb),public.kalling_verification_reserve(uuid,text,text,bigint,text),public.kalling_verification_change(uuid,text,jsonb),public.kalling_verification_open(uuid),public.kalling_verification_prepare_validation(uuid),public.kalling_portal_buyer_badges(uuid) from public,anon;
grant execute on function public.kalling_verification_list(uuid),public.kalling_verification_save(jsonb),public.kalling_verification_reserve(uuid,text,text,bigint,text),public.kalling_verification_change(uuid,text,jsonb),public.kalling_verification_open(uuid),public.kalling_verification_prepare_validation(uuid),public.kalling_portal_buyer_badges(uuid) to authenticated;
revoke all on function public.kalling_verification_attest(uuid,uuid,text,bigint,text) from public,anon,authenticated;
grant execute on function public.kalling_verification_attest(uuid,uuid,text,bigint,text) to service_role;
commit;
