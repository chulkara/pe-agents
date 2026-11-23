-- Seller staff helpers, and the advisor's read-only view of party-appointed professionals.
--
-- A helper (office manager, bookkeeper, controller) is invited by the business owner, sees only the
-- document requests the owner assigns (title and description), and uploads files that wait for the
-- owner. Helper files are stored in the owner-portal bucket but are not portal files until the owner
-- approves: the brokerage's Storage and table policies only reach rows in kalling_portal_files, so
-- the brokerage cannot read a helper file before approval.
begin;

create table kalling_private.helper_people(
 id uuid primary key default gen_random_uuid(),
 portal_id uuid not null references public.kalling_portals(id),
 name text not null check(length(name) between 2 and 120),
 email text not null check(email=lower(email) and email~'^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' and length(email)<=254),
 status text not null default 'Invited' check(status in ('Invited','Active','Removed')),
 request_ids uuid[] not null default '{}',
 user_id uuid references auth.users(id), created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(), accepted_at timestamptz,
 expires_at timestamptz not null check(expires_at<=created_at+interval '366 days')
);
create unique index helper_people_open on kalling_private.helper_people(portal_id,email) where status<>'Removed';
create table kalling_private.helper_invites(token_hash text primary key,helper_id uuid not null references kalling_private.helper_people(id),used_at timestamptz);
create table kalling_private.helper_uploads(
 id uuid primary key default gen_random_uuid(),
 helper_id uuid not null references kalling_private.helper_people(id),
 portal_id uuid not null references public.kalling_portals(id),
 request_id uuid not null references public.kalling_portal_requests(id),
 name text not null check(length(name) between 1 and 200), mime text not null, size bigint not null check(size between 1 and 10485760),
 sha256 text not null check(sha256~'^[0-9a-f]{64}$'), note text not null default '' check(length(note)<=600),
 object_path text not null unique,
 status text not null default 'Reserved' check(status in ('Reserved','Waiting for owner','Approved','Declined','Withdrawn')),
 created_at timestamptz not null default now(), decided_at timestamptz, owner_note text not null default '' check(length(owner_note)<=600),
 file_id uuid references public.kalling_portal_files(id)
);
alter table kalling_private.helper_people enable row level security;alter table kalling_private.helper_invites enable row level security;alter table kalling_private.helper_uploads enable row level security;

-- The signed-in owner of an active portal whose requests are open.
create function kalling_private.helper_need_owner(p_portal uuid) returns public.kalling_portals language plpgsql stable security definer set search_path='' as $$
 declare p public.kalling_portals;begin
 select * into p from public.kalling_portals where id=p_portal;
 if p.id is null or kalling_private.portal_role(p.id) is distinct from 'seller' then raise exception 'Only the business owner can do this.' using errcode='42501';end if;
 if p.requests_hidden then raise exception 'Document requests open after the engagement letter is signed.' using errcode='42501';end if;
 return p;end $$;
-- The signed-in helper, by confirmed email and accepted invitation, while the portal is open.
create function kalling_private.helper_me(p_id uuid) returns kalling_private.helper_people language sql stable security definer set search_path='' as $$
 select h.* from kalling_private.helper_people h join auth.users u on u.id=h.user_id join public.kalling_portals p on p.id=h.portal_id
 where h.id=p_id and h.user_id=auth.uid() and u.email_confirmed_at is not null and lower(u.email)=h.email and h.status='Active' and h.expires_at>now()
  and p.status='Active' and not p.requests_hidden
$$;

create function public.kalling_helper_add(p_portal uuid,p_name text,p_email text,p_days integer default 90) returns text language plpgsql security definer set search_path='' as $$
 declare p public.kalling_portals;e text=lower(trim(coalesce(p_email,'')));tok text=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');v_id uuid;begin
 p=kalling_private.helper_need_owner(p_portal);
 if length(trim(coalesce(p_name,''))) not between 2 and 120 then raise exception 'Enter their name.' using errcode='22023';end if;
 if e!~'^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception 'Enter their email address.' using errcode='22023';end if;
 if e=lower(p.owner_email) then raise exception 'Use their own email address, not yours.' using errcode='22023';end if;
 if p_days is null or p_days not between 1 and 365 then raise exception 'Choose access of up to a year.' using errcode='22023';end if;
 if exists(select 1 from kalling_private.helper_people where portal_id=p_portal and email=e and status<>'Removed') then raise exception 'This person is already on your list.' using errcode='23505';end if;
 if (select count(*) from kalling_private.helper_people where portal_id=p_portal and status<>'Removed')>=4 then raise exception 'You can add up to 4 people.' using errcode='22023';end if;
 insert into kalling_private.helper_people(portal_id,name,email,created_by,expires_at) values(p_portal,trim(p_name),e,auth.uid(),now()+make_interval(days=>p_days)) returning helper_people.id into v_id;
 insert into kalling_private.helper_invites values(encode(sha256(convert_to(tok,'UTF8')),'hex'),v_id,null);
 return tok;end $$;

create function public.kalling_helper_assign(p_helper uuid,p_requests uuid[]) returns void language plpgsql security definer set search_path='' as $$
 declare h kalling_private.helper_people;begin
 select * into h from kalling_private.helper_people where id=p_helper and status<>'Removed';if h.id is null then raise exception 'This person is not on your list.' using errcode='42501';end if;
 perform kalling_private.helper_need_owner(h.portal_id);
 if coalesce(array_length(p_requests,1),0)>40 or exists(select 1 from unnest(coalesce(p_requests,'{}')) r where not exists(select 1 from public.kalling_portal_requests q where q.id=r and q.portal_id=h.portal_id)) then raise exception 'Choose requests from your own portal.' using errcode='22023';end if;
 update kalling_private.helper_people set request_ids=(select coalesce(array_agg(distinct r),'{}') from unnest(coalesce(p_requests,'{}')) r) where id=p_helper;end $$;

create function public.kalling_helper_remove(p_helper uuid) returns void language plpgsql security definer set search_path='' as $$
 declare h kalling_private.helper_people;begin
 select * into h from kalling_private.helper_people where id=p_helper and status<>'Removed';if h.id is null then raise exception 'This person is not on your list.' using errcode='42501';end if;
 perform kalling_private.helper_need_owner(h.portal_id);
 update kalling_private.helper_people set status='Removed',request_ids='{}' where id=p_helper;
 update kalling_private.helper_uploads set status='Withdrawn',decided_at=now(),owner_note='Removed by the owner.' where helper_id=p_helper and status in ('Reserved','Waiting for owner');end $$;

create function public.kalling_helper_owner_list(p_portal uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
 begin perform kalling_private.helper_need_owner(p_portal);
 return (select coalesce(jsonb_agg(jsonb_build_object(
  'helper',jsonb_build_object('id',h.id,'portalId',h.portal_id,'name',h.name,'email',h.email,'status',h.status,'requestIds',to_jsonb(h.request_ids),'createdAt',h.created_at,'acceptedAt',h.accepted_at,'expiresAt',h.expires_at),
  'expired',h.expires_at<=now(),
  'uploads',(select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'helperId',u.helper_id,'portalId',u.portal_id,'requestId',u.request_id,'name',u.name,'mime',u.mime,'size',u.size,'note',u.note,'status',u.status,'createdAt',u.created_at,'decidedAt',u.decided_at,'ownerNote',u.owner_note,'fileId',u.file_id,'requestTitle',q.title) order by u.created_at desc),'[]')
    from kalling_private.helper_uploads u join public.kalling_portal_requests q on q.id=u.request_id where u.helper_id=h.id and u.status<>'Reserved')
 ) order by h.created_at),'[]') from kalling_private.helper_people h where h.portal_id=p_portal and h.status<>'Removed');end $$;

create function public.kalling_helper_accept(p_token text) returns void language plpgsql security definer set search_path='' as $$
 declare i kalling_private.helper_invites;h kalling_private.helper_people;e text;ok boolean;begin
 select lower(email),email_confirmed_at is not null into e,ok from auth.users where id=auth.uid();
 if not coalesce(ok,false) then raise exception 'Confirm your email address first.' using errcode='42501';end if;
 select * into i from kalling_private.helper_invites where token_hash=encode(sha256(convert_to(coalesce(p_token,''),'UTF8')),'hex') for update;
 select * into h from kalling_private.helper_people where id=i.helper_id;
 if i.token_hash is null or i.used_at is not null or h.status<>'Invited' or h.expires_at<=now() then raise exception 'This invitation has expired, was used, or was withdrawn.' using errcode='42501';end if;
 if h.email<>e then raise exception 'Sign in with the email address the invitation was sent to.' using errcode='42501';end if;
 update kalling_private.helper_people set status='Active',accepted_at=now(),user_id=auth.uid() where id=h.id;
 update kalling_private.helper_invites set used_at=now() where token_hash=i.token_hash;end $$;

-- Titles and descriptions of assigned requests, and the helper's own uploads. Never why, sharing,
-- buyers, offers, messages, letters or any other portal content.
create function public.kalling_helper_home() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object(
  'helper',jsonb_build_object('id',h.id,'name',h.name,'expiresAt',h.expires_at),'ownerName',p.owner_name,'businessName',p.business_name,
  'expired',(kalling_private.helper_me(h.id)).id is null,
  'requests',case when (kalling_private.helper_me(h.id)).id is null then '[]'::jsonb else (select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'title',q.title,'needed',q.needed,'due',q.due,'complete',q.status in ('Accepted','Not applicable'),
    'uploads',(select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'name',u.name,'status',u.status,'createdAt',u.created_at,'ownerNote',u.owner_note) order by u.created_at),'[]') from kalling_private.helper_uploads u where u.helper_id=h.id and u.request_id=q.id and u.status<>'Reserved')) order by q.created_at),'[]')
   from public.kalling_portal_requests q where q.id=any(h.request_ids) and q.portal_id=h.portal_id) end
 ) order by h.created_at),'[]')
 from kalling_private.helper_people h join public.kalling_portals p on p.id=h.portal_id join auth.users u on u.id=h.user_id
 where h.user_id=auth.uid() and h.status='Active' and u.email_confirmed_at is not null and lower(u.email)=h.email
$$;

create function public.kalling_helper_reserve(p_helper uuid,p_request uuid,p_name text,p_mime text,p_size bigint,p_sha256 text,p_note text default '') returns jsonb language plpgsql security definer set search_path='' as $$
 declare h kalling_private.helper_people;q public.kalling_portal_requests;v_id uuid=gen_random_uuid();path text;begin
 h=kalling_private.helper_me(p_helper);if h.id is null then raise exception 'Your access has ended. Ask the owner to add you again.' using errcode='42501';end if;
 select * into q from public.kalling_portal_requests where id=p_request;
 if q.id is null or not (p_request=any(h.request_ids)) or q.portal_id<>h.portal_id then raise exception 'This request is not assigned to you.' using errcode='42501';end if;
 if q.status in ('Accepted','Not applicable') then raise exception 'This request is already complete.' using errcode='42501';end if;
 if coalesce(p_sha256,'')!~'^[0-9a-f]{64}$' then raise exception 'File fingerprint missing.' using errcode='22023';end if;
 if p_size is null or p_size not between 1 and 10485760 then raise exception 'Each file can be up to 10 MB. Split larger files.' using errcode='22023';end if;
 if p_mime is null or p_name is null or p_mime not in ('application/pdf','image/png','image/jpeg','text/plain','text/csv','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/msword') or p_name!~*'[.](pdf|png|jpe?g|txt|csv|xlsx?|docx?)$' then raise exception 'Use PDF, image, Word, Excel, CSV or text files.' using errcode='22023';end if;
 if exists(select 1 from kalling_private.helper_uploads where helper_id=h.id and request_id=p_request and sha256=p_sha256 and status='Waiting for owner') then raise exception 'You already sent this file for this request.' using errcode='23505';end if;
 if (select count(*) from kalling_private.helper_uploads where helper_id=h.id and status in ('Reserved','Waiting for owner'))>=50 then raise exception 'The owner has 50 of your files to review. Wait for them to catch up.' using errcode='22023';end if;
 path='helper/'||h.portal_id::text||'/'||v_id::text;
 insert into kalling_private.helper_uploads(id,helper_id,portal_id,request_id,name,mime,size,sha256,note,object_path) values(v_id,h.id,h.portal_id,p_request,left(trim(p_name),200),p_mime,p_size,p_sha256,left(trim(coalesce(p_note,'')),600),path);
 return jsonb_build_object('id',v_id,'path',path);end $$;

create function kalling_private.helper_upload_ok(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from kalling_private.helper_uploads u where u.object_path=p_path and u.status='Reserved' and u.created_at>now()-interval '1 day' and (kalling_private.helper_me(u.helper_id)).id is not null)
$$;
create function kalling_private.helper_read_ok(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from kalling_private.helper_uploads u join public.kalling_portals p on p.id=u.portal_id
  where u.object_path=p_path and u.status='Waiting for owner' and kalling_private.portal_role(u.portal_id)='seller' and not p.requests_hidden)
$$;
create policy kalling_helper_upload on storage.objects for insert to authenticated with check(bucket_id='kalling-portal' and kalling_private.helper_upload_ok(name));
create policy kalling_helper_read on storage.objects for select to authenticated using(bucket_id='kalling-portal' and storage.allow_only_operation('object.get_authenticated') and kalling_private.helper_read_ok(name));

create function public.kalling_helper_finish(p_upload uuid) returns void language plpgsql security definer set search_path='' as $$
 declare u kalling_private.helper_uploads;bytes bigint;mime text;begin
 select * into u from kalling_private.helper_uploads where id=p_upload for update;
 if u.id is null or (kalling_private.helper_me(u.helper_id)).id is null then raise exception 'Upload unavailable.' using errcode='42501';end if;
 if u.status<>'Reserved' then return;end if;
 select (metadata->>'size')::bigint,metadata->>'mimetype' into bytes,mime from storage.objects where bucket_id='kalling-portal' and name=u.object_path;
 if bytes is distinct from u.size or mime is distinct from u.mime then raise exception 'The file did not arrive completely. Try uploading it again.' using errcode='22023';end if;
 update kalling_private.helper_uploads set status='Waiting for owner' where id=p_upload;end $$;

create function public.kalling_helper_withdraw(p_upload uuid) returns void language plpgsql security definer set search_path='' as $$
 declare u kalling_private.helper_uploads;h kalling_private.helper_people;begin
 select * into u from kalling_private.helper_uploads where id=p_upload;select * into h from kalling_private.helper_people where id=u.helper_id;
 if u.id is null or h.user_id is distinct from auth.uid() or u.status not in ('Reserved','Waiting for owner') then raise exception 'You can only withdraw your own files that are still waiting.' using errcode='42501';end if;
 update kalling_private.helper_uploads set status='Withdrawn',decided_at=now() where id=p_upload;end $$;

create function public.kalling_helper_upload_path(p_upload uuid) returns text language plpgsql stable security definer set search_path='' as $$
 declare u kalling_private.helper_uploads;begin
 select * into u from kalling_private.helper_uploads where id=p_upload and status='Waiting for owner';
 if u.id is null then raise exception 'This file is no longer waiting for you.' using errcode='42501';end if;
 perform kalling_private.helper_need_owner(u.portal_id);return u.object_path;end $$;

-- Approval turns the helper's file into the owner's own portal upload on that request.
create function public.kalling_helper_decide(p_upload uuid,p_decision text,p_note text default '') returns void language plpgsql security definer set search_path='' as $$
 declare u kalling_private.helper_uploads;h kalling_private.helper_people;p public.kalling_portals;f public.kalling_portal_files;begin
 select * into u from kalling_private.helper_uploads where id=p_upload for update;
 if u.id is null or u.status<>'Waiting for owner' then raise exception 'This file is no longer waiting for you.' using errcode='42501';end if;
 p=kalling_private.helper_need_owner(u.portal_id);perform 1 from public.kalling_portals where id=p.id for update;
 if p_decision='Declined' then update kalling_private.helper_uploads set status='Declined',decided_at=now(),owner_note=left(trim(coalesce(p_note,'')),600) where id=u.id;return;end if;
 if p_decision<>'Approved' then raise exception 'Choose approve or send back.' using errcode='22023';end if;
 if exists(select 1 from public.kalling_portal_requests where id=u.request_id and status in ('Accepted','Not applicable')) then raise exception 'This request is already complete.' using errcode='42501';end if;
 select * into h from kalling_private.helper_people where id=u.helper_id;
 select * into f from public.kalling_portal_files where portal_id=u.portal_id and sha256=u.sha256 and status='stored';
 if f.id is null then
  if (select count(*) from public.kalling_portal_files where portal_id=u.portal_id)>=100 then raise exception 'This portal has reached its 100-file limit. Contact your help contact.';end if;
  if (select coalesce(sum(size),0) from public.kalling_portal_files where portal_id=u.portal_id)+u.size>209715200 then raise exception 'This portal has reached its storage limit. Contact your help contact.';end if;
  insert into public.kalling_portal_files(portal_id,request_id,name,mime,size,sha256,object_path,status,uploaded_by,uploader_name,side)
   values(u.portal_id,u.request_id,u.name,u.mime,u.size,u.sha256,u.object_path,'stored',auth.uid(),left(p.owner_name||' (gathered by '||h.name||')',200),'seller') returning * into f;
  insert into public.kalling_audit(firm_id,actor_id,event,detail) values(p.firm_id,auth.uid(),'portal.helper_file_approved',jsonb_build_object('portal_id',p.id,'file_id',f.id));
 end if;
 perform public.kalling_portal_link(u.request_id,f.id);
 update kalling_private.helper_uploads set status='Approved',decided_at=now(),owner_note=left(trim(coalesce(p_note,'')),600),file_id=f.id where id=u.id;end $$;

-- Advisors see who each party appointed (name, role, firm, status), never what was shared or opened.
create function public.kalling_pro_advisor_list(p_portal uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
 declare p public.kalling_portals;begin
 select * into p from public.kalling_portals where id=p_portal;
 if p.id is null or coalesce(kalling_private.portal_role(p.id),'') not in ('firm-write','firm-read') then raise exception 'Advisor access denied.' using errcode='42501';end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('side',x.side,'partyName',x.party_name,'name',x.name,'email',x.email,'firm',x.firm,'role',x.role,'status',case when x.expires_at<=now() then 'Expired' else x.status end,'expiresAt',x.expires_at) order by x.side desc,x.party_name,x.created_at),'[]')
  from kalling_private.pro_people x where x.status<>'Removed' and (
   x.side='seller' and x.party_key=p_portal
   or x.side='buyer' and (exists(select 1 from kalling_private.execution_transactions t where t.portal_id=p_portal and t.buyer_id=x.party_key)
     or exists(select 1 from public.kalling_access a join public.kalling_listing_private lp on lp.listing_id=a.listing_id where a.buyer_id=x.party_key and a.status='Approved' and lp.company_id=p.company_id)
     or exists(select 1 from public.kalling_access a join public.kalling_dataroom_rooms r on r.listing_id=a.listing_id where a.buyer_id=x.party_key and a.status='Approved' and r.portal_id=p_portal))));
 end $$;

revoke all on function kalling_private.helper_need_owner(uuid),kalling_private.helper_me(uuid) from public,anon,authenticated;
revoke all on function kalling_private.helper_upload_ok(text),kalling_private.helper_read_ok(text) from public,anon;grant execute on function kalling_private.helper_upload_ok(text),kalling_private.helper_read_ok(text) to authenticated;
revoke all on function public.kalling_helper_add(uuid,text,text,integer),public.kalling_helper_assign(uuid,uuid[]),public.kalling_helper_remove(uuid),public.kalling_helper_owner_list(uuid),public.kalling_helper_accept(text),public.kalling_helper_home(),public.kalling_helper_reserve(uuid,uuid,text,text,bigint,text,text),public.kalling_helper_finish(uuid),public.kalling_helper_withdraw(uuid),public.kalling_helper_upload_path(uuid),public.kalling_helper_decide(uuid,text,text),public.kalling_pro_advisor_list(uuid) from public,anon;
grant execute on function public.kalling_helper_add(uuid,text,text,integer),public.kalling_helper_assign(uuid,uuid[]),public.kalling_helper_remove(uuid),public.kalling_helper_owner_list(uuid),public.kalling_helper_accept(text),public.kalling_helper_home(),public.kalling_helper_reserve(uuid,uuid,text,text,bigint,text,text),public.kalling_helper_finish(uuid),public.kalling_helper_withdraw(uuid),public.kalling_helper_upload_path(uuid),public.kalling_helper_decide(uuid,text,text),public.kalling_pro_advisor_list(uuid) to authenticated;
comment on table kalling_private.helper_uploads is 'Files a seller''s staff helper sends. Not portal files, and unreadable by the brokerage, until the owner approves.';
commit;
