-- Kalling foundation. Apply once in a dedicated Supabase project as postgres.
-- Tenant data is accessed through RLS; all writes use bounded, authenticated RPCs.
begin;
create schema if not exists kalling_private;
revoke all on schema kalling_private from public, anon, authenticated;
grant usage on schema kalling_private to authenticated, service_role;

create table public.kalling_firms (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 2 and 120),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create table public.kalling_members (
 firm_id uuid not null references public.kalling_firms(id), user_id uuid not null references auth.users(id),
 role text not null check(role in ('owner','admin','analyst','viewer')), active boolean not null default true,
 created_at timestamptz not null default now(), primary key(firm_id,user_id)
);
create index kalling_members_user on public.kalling_members(user_id) where active;
create table public.kalling_workspaces (
 firm_id uuid primary key references public.kalling_firms(id), data jsonb not null,
 version bigint not null default 1, updated_by uuid not null references auth.users(id), updated_at timestamptz not null default now()
);
create table public.kalling_workspace_versions (
 firm_id uuid not null references public.kalling_firms(id), version bigint not null, data jsonb not null,
 actor_id uuid not null references auth.users(id), reason text not null, created_at timestamptz not null default now(), primary key(firm_id,version)
);
create table public.kalling_audit (
 id bigint generated always as identity primary key, firm_id uuid not null references public.kalling_firms(id),
 actor_id uuid references auth.users(id), event text not null, detail jsonb not null default '{}', created_at timestamptz not null default now()
);
create table kalling_private.invites (
 id uuid primary key default gen_random_uuid(), firm_id uuid not null references public.kalling_firms(id),
 email text not null, role text not null check(role in ('admin','analyst','viewer')), token_hash text not null unique,
 created_by uuid not null references auth.users(id), expires_at timestamptz not null default now()+interval '7 days', accepted_at timestamptz, revoked_at timestamptz
);
create table public.kalling_documents (
 id uuid primary key default gen_random_uuid(), firm_id uuid not null references public.kalling_firms(id), company_id text not null,
 name text not null check(length(name) between 1 and 200), mime_type text not null,
 size_bytes bigint not null check(size_bytes between 1 and 5242880), object_path text not null unique,
 status text not null default 'reserved' check(status in ('reserved','stored')),
 previous_id uuid references public.kalling_documents(id), created_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create index kalling_documents_firm on public.kalling_documents(firm_id,created_at);
create table public.kalling_jobs (
 id uuid primary key default gen_random_uuid(), firm_id uuid not null references public.kalling_firms(id),
 kind text not null check(kind='workspace.audit'), status text not null default 'queued' check(status in ('queued','running','retry','succeeded','failed','cancelled')),
 idempotency_key text not null check(length(idempotency_key) between 8 and 120), requested_by uuid not null references auth.users(id),
 attempts integer not null default 0, max_attempts integer not null default 3 check(max_attempts between 1 and 5),
 available_at timestamptz not null default now(), lease_token uuid, lease_until timestamptz,
 checkpoint jsonb not null default '{}', result jsonb, last_error text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(firm_id,idempotency_key)
);
create index kalling_jobs_ready on public.kalling_jobs(available_at,created_at) where status in ('queued','retry','running');
create table public.kalling_worker_status (id text primary key, last_tick timestamptz not null, processed integer not null default 0);

create function kalling_private.role_for(f uuid) returns text language sql stable security definer set search_path='' as $$
 select role from public.kalling_members where firm_id=f and user_id=auth.uid() and active
$$;
create function kalling_private.require_role(f uuid, allowed text[]) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or coalesce(kalling_private.role_for(f)=any(allowed),false)=false then raise exception 'Firm access denied' using errcode='42501'; end if;
end $$;
create function kalling_private.validate_workspace(d jsonb) returns void language plpgsql set search_path='' as $$
begin
 if d is null or jsonb_typeof(d)<>'object' or jsonb_typeof(d->'firm') is distinct from 'object' or jsonb_typeof(d->'companies') is distinct from 'array' or jsonb_typeof(d->'deals') is distinct from 'array' or jsonb_typeof(d->'events') is distinct from 'array' then raise exception 'Invalid workspace structure'; end if;
 if coalesce(length(trim(d#>>'{firm,name}')),0) not between 2 and 120 then raise exception 'Firm name must be 2 to 120 characters'; end if;
 if octet_length(d::text)>2097152 then raise exception 'Workspace exceeds 2 MB; export older snapshots before continuing'; end if;
 if jsonb_array_length(d->'companies')>5000 then raise exception 'Workspace company limit reached'; end if;
 if exists(select 1 from jsonb_array_elements(d->'companies') c where jsonb_typeof(c)<>'object' or coalesce(length(c->>'id'),0) not between 1 and 100 or coalesce(length(c->>'name'),0)=0) then raise exception 'Invalid company record'; end if;
 if (select count(*) from jsonb_array_elements(d->'companies'))<>(select count(distinct c->>'id') from jsonb_array_elements(d->'companies') c) then raise exception 'Duplicate company identifiers'; end if;
end $$;

-- Grant SELECT only. No client can alter membership, paths, jobs, audit, or versions directly.
alter table public.kalling_firms enable row level security;
alter table public.kalling_members enable row level security;
alter table public.kalling_workspaces enable row level security;
alter table public.kalling_workspace_versions enable row level security;
alter table public.kalling_audit enable row level security;
alter table public.kalling_documents enable row level security;
alter table public.kalling_jobs enable row level security;
alter table public.kalling_worker_status enable row level security;
create policy firm_read on public.kalling_firms for select to authenticated using(kalling_private.role_for(id) is not null);
create policy members_read on public.kalling_members for select to authenticated using(kalling_private.role_for(firm_id) is not null);
create policy workspace_read on public.kalling_workspaces for select to authenticated using(kalling_private.role_for(firm_id) is not null);
create policy versions_read on public.kalling_workspace_versions for select to authenticated using(kalling_private.role_for(firm_id) is not null);
create policy audit_read on public.kalling_audit for select to authenticated using(kalling_private.role_for(firm_id) is not null);
create policy document_read on public.kalling_documents for select to authenticated using(kalling_private.role_for(firm_id) is not null);
create policy jobs_read on public.kalling_jobs for select to authenticated using(kalling_private.role_for(firm_id) is not null);
create policy worker_read on public.kalling_worker_status for select to authenticated using(auth.uid() is not null);
revoke all on public.kalling_firms,public.kalling_members,public.kalling_workspaces,public.kalling_workspace_versions,public.kalling_audit,public.kalling_documents,public.kalling_jobs,public.kalling_worker_status from anon,authenticated;
grant select on public.kalling_firms,public.kalling_members,public.kalling_workspaces,public.kalling_workspace_versions,public.kalling_audit,public.kalling_documents,public.kalling_jobs,public.kalling_worker_status to authenticated;

create function public.kalling_create_firm(p_name text,p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare f uuid; begin
 if auth.uid() is null then raise exception 'Sign in first' using errcode='42501'; end if;
 if not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then raise exception 'Confirm your email first' using errcode='42501'; end if;
 -- Lock identity row to make the per-user free-tier cap race-safe.
 perform 1 from auth.users where id=auth.uid() for update;
 if (select count(*) from public.kalling_firms where created_by=auth.uid())>=3 then raise exception 'Three-firm pilot limit reached'; end if;
 perform kalling_private.validate_workspace(p_data);
 insert into public.kalling_firms(name,created_by) values(trim(p_name),auth.uid()) returning id into f;
 insert into public.kalling_members(firm_id,user_id,role) values(f,auth.uid(),'owner');
 insert into public.kalling_workspaces(firm_id,data,updated_by) values(f,p_data,auth.uid());
 insert into public.kalling_workspace_versions(firm_id,version,data,actor_id,reason) values(f,1,p_data,auth.uid(),'Created firm workspace');
 insert into public.kalling_audit(firm_id,actor_id,event) values(f,auth.uid(),'firm.created');
 return f;
end $$;
create function public.kalling_save_workspace(p_firm uuid,p_expected_version bigint,p_data jsonb,p_reason text) returns bigint language plpgsql security definer set search_path='' as $$
declare v bigint; begin
 perform kalling_private.require_role(p_firm,array['owner','admin','analyst']);
 perform kalling_private.validate_workspace(p_data);
 if length(trim(p_reason)) not between 3 and 500 then raise exception 'Record a concise update reason'; end if;
 update public.kalling_workspaces set data=p_data,version=version+1,updated_by=auth.uid(),updated_at=now() where firm_id=p_firm and version=p_expected_version returning version into v;
 if v is null then raise exception 'Workspace changed elsewhere. Export your unsaved work and reload before editing.' using errcode='40001'; end if;
 update public.kalling_firms set name=trim(p_data#>>'{firm,name}') where id=p_firm;
 insert into public.kalling_workspace_versions(firm_id,version,data,actor_id,reason) values(p_firm,v,p_data,auth.uid(),trim(p_reason));
 -- Keep bounded full snapshots for free-tier storage. The metadata audit remains append-only.
 delete from public.kalling_workspace_versions where firm_id=p_firm and version<v-9;
 insert into public.kalling_audit(firm_id,actor_id,event,detail) values(p_firm,auth.uid(),'workspace.saved',jsonb_build_object('version',v,'reason',p_reason));
 return v;
end $$;
create function public.kalling_invite_member(p_firm uuid,p_email text,p_role text) returns text language plpgsql security definer set search_path='' as $$
declare token text; begin
 perform kalling_private.require_role(p_firm,array['owner','admin']);
 if p_role='admin' and kalling_private.role_for(p_firm)<>'owner' then raise exception 'Only the owner can invite administrators' using errcode='42501'; end if;
 if p_role not in ('admin','analyst','viewer') or p_email is null or p_email!~'^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' or length(p_email)>254 then raise exception 'Use a valid email and role'; end if;
 if (select count(*) from kalling_private.invites where firm_id=p_firm and accepted_at is null and revoked_at is null and expires_at>now())>=20 then raise exception 'Pending invitation limit reached'; end if;
 token=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
 insert into kalling_private.invites(firm_id,email,role,token_hash,created_by) values(p_firm,lower(trim(p_email)),p_role,encode(sha256(convert_to(token,'UTF8')),'hex'),auth.uid());
 insert into public.kalling_audit(firm_id,actor_id,event,detail) values(p_firm,auth.uid(),'member.invited',jsonb_build_object('role',p_role));
 return token;
end $$;
create function public.kalling_accept_invite(p_token text) returns uuid language plpgsql security definer set search_path='' as $$
declare i kalling_private.invites; mail text; begin
 if auth.uid() is null then raise exception 'Sign in first' using errcode='42501'; end if;
 select lower(email) into mail from auth.users where id=auth.uid() and email_confirmed_at is not null;
 select * into i from kalling_private.invites where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and accepted_at is null and revoked_at is null and expires_at>now() for update;
 if i.id is null or mail is distinct from i.email or not exists(select 1 from public.kalling_members where firm_id=i.firm_id and user_id=i.created_by and active and role in ('owner','admin') and (i.role<>'admin' or role='owner')) then raise exception 'Invitation is unavailable for this verified account' using errcode='42501'; end if;
 if exists(select 1 from public.kalling_members where firm_id=i.firm_id and user_id=auth.uid() and active) then raise exception 'Already a member of this firm'; end if;
 insert into public.kalling_members(firm_id,user_id,role) values(i.firm_id,auth.uid(),i.role) on conflict(firm_id,user_id) do update set role=excluded.role,active=true;
 update kalling_private.invites set accepted_at=now() where id=i.id;
 insert into public.kalling_audit(firm_id,actor_id,event,detail) values(i.firm_id,auth.uid(),'member.joined',jsonb_build_object('role',i.role));
 return i.firm_id;
end $$;
create function public.kalling_set_member(p_firm uuid,p_user uuid,p_role text,p_active boolean) returns void language plpgsql security definer set search_path='' as $$
declare previous_role text; begin
 perform kalling_private.require_role(p_firm,array['owner','admin']);
 select role into previous_role from public.kalling_members where firm_id=p_firm and user_id=p_user for update;
 if previous_role is null then raise exception 'Member not found'; end if;
 if previous_role='owner' or p_role not in ('admin','analyst','viewer') or p_active is null then raise exception 'Owner membership is protected'; end if;
 if kalling_private.role_for(p_firm)<>'owner' and (previous_role='admin' or p_role='admin') then raise exception 'Owner approval required for administrator changes' using errcode='42501'; end if;
 update public.kalling_members set role=p_role,active=p_active where firm_id=p_firm and user_id=p_user;
 update kalling_private.invites set revoked_at=now() where firm_id=p_firm and email=(select lower(email) from auth.users where id=p_user) and accepted_at is null and revoked_at is null;
 insert into public.kalling_audit(firm_id,actor_id,event,detail) values(p_firm,auth.uid(),'member.changed',jsonb_build_object('user_id',p_user,'role',p_role,'active',p_active));
end $$;

-- Objects are immutable and private. Membership is checked for every authenticated download;
-- no public bucket or reusable signed download links are issued by this app.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('kalling-private','kalling-private',false,5242880,array['application/pdf','text/plain','text/csv','application/json','text/markdown']);
create function public.kalling_reserve_document(p_firm uuid,p_company text,p_name text,p_mime text,p_size bigint,p_previous uuid default null) returns public.kalling_documents language plpgsql security definer set search_path='' as $$
declare d public.kalling_documents; n uuid=gen_random_uuid(); begin
 perform kalling_private.require_role(p_firm,array['owner','admin','analyst']);
 -- Serialize quota reservation, including unfinished uploads.
 perform 1 from public.kalling_firms where id=p_firm for update;
 if not exists(select 1 from public.kalling_workspaces w,jsonb_array_elements(w.data->'companies') c where w.firm_id=p_firm and c->>'id'=p_company) then raise exception 'Company not in this firm'; end if;
 if p_mime not in ('application/pdf','text/plain','text/csv','application/json','text/markdown') then raise exception 'Unsupported file type'; end if;
 if p_name!~*'[.](pdf|txt|csv|json|md)$' then raise exception 'Use PDF, TXT, CSV, JSON, or MD'; end if;
 if p_previous is not null and not exists(select 1 from public.kalling_documents where id=p_previous and firm_id=p_firm and company_id=p_company and status='stored') then raise exception 'Revision must belong to this company'; end if;
 if (select count(*) from public.kalling_documents where firm_id=p_firm)>=20 then raise exception '20-file pilot limit reached, including incomplete uploads'; end if;
 if (select coalesce(sum(size_bytes),0) from public.kalling_documents where firm_id=p_firm)+p_size>104857600 then raise exception '100 MB per-firm pilot file limit reached'; end if;
 insert into public.kalling_documents(id,firm_id,company_id,name,mime_type,size_bytes,object_path,previous_id,created_by) values(n,p_firm,p_company,p_name,p_mime,p_size,p_firm::text||'/'||n::text||'/'||gen_random_uuid()::text,p_previous,auth.uid()) returning * into d;
 insert into public.kalling_audit(firm_id,actor_id,event,detail) values(p_firm,auth.uid(),'document.reserved',jsonb_build_object('document_id',n)); return d;
end $$;
create function kalling_private.can_upload(path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.kalling_documents d where d.object_path=path and d.created_by=auth.uid() and d.status='reserved' and d.created_at>now()-interval '1 hour' and kalling_private.role_for(d.firm_id) in ('owner','admin','analyst'))
$$;
create function kalling_private.can_download(path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.kalling_documents d where d.object_path=path and d.status='stored' and kalling_private.role_for(d.firm_id) is not null)
$$;
create policy kalling_private_upload on storage.objects for insert to authenticated with check(bucket_id='kalling-private' and kalling_private.can_upload(name));
create policy kalling_private_download on storage.objects for select to authenticated using(bucket_id='kalling-private' and kalling_private.can_download(name));
create function public.kalling_finish_document(p_document uuid) returns void language plpgsql security definer set search_path='' as $$
declare d public.kalling_documents; bytes bigint; mime text; begin
 select * into d from public.kalling_documents where id=p_document for update;
 if d.id is null then raise exception 'Document unavailable' using errcode='42501'; end if;
 perform kalling_private.require_role(d.firm_id,array['owner','admin','analyst']);
 if d.status='stored' then return; end if;
 select (metadata->>'size')::bigint,metadata->>'mimetype' into bytes,mime from storage.objects where bucket_id='kalling-private' and name=d.object_path;
 if bytes is distinct from d.size_bytes or mime is distinct from d.mime_type then raise exception 'Uploaded file size or type does not match reservation'; end if;
 update public.kalling_documents set status='stored' where id=d.id;
 insert into public.kalling_audit(firm_id,actor_id,event,detail) values(d.firm_id,auth.uid(),'document.stored',jsonb_build_object('document_id',d.id,'bytes',bytes));
end $$;

-- Only registered, zero-spend handlers can be queued in this release.
create function public.kalling_enqueue_job(p_firm uuid,p_key text) returns uuid language plpgsql security definer set search_path='' as $$
declare j uuid; begin
 perform kalling_private.require_role(p_firm,array['owner','admin','analyst']);
 perform 1 from public.kalling_firms where id=p_firm for update;
 select id into j from public.kalling_jobs where firm_id=p_firm and idempotency_key=p_key;
 if j is not null then return j; end if;
 if (select count(*) from public.kalling_jobs where firm_id=p_firm and created_at>now()-interval '1 day')>=25 then raise exception '25 jobs per firm per day pilot limit reached'; end if;
 insert into public.kalling_jobs(firm_id,kind,idempotency_key,requested_by) values(p_firm,'workspace.audit',p_key,auth.uid()) returning id into j;
 insert into public.kalling_audit(firm_id,actor_id,event,detail) values(p_firm,auth.uid(),'job.queued',jsonb_build_object('job_id',j)); return j;
end $$;
create function public.kalling_cancel_job(p_job uuid) returns void language plpgsql security definer set search_path='' as $$
declare f uuid; begin
 select firm_id into f from public.kalling_jobs where id=p_job;
 perform kalling_private.require_role(f,array['owner','admin','analyst']);
 update public.kalling_jobs set status='cancelled',lease_token=null,lease_until=null,updated_at=now() where id=p_job and status in ('queued','retry','running');
 insert into public.kalling_audit(firm_id,actor_id,event,detail) values(f,auth.uid(),'job.cancelled',jsonb_build_object('job_id',p_job));
end $$;
create function kalling_private.claim_job() returns public.kalling_jobs language plpgsql security definer set search_path='' as $$
declare j public.kalling_jobs; begin
 -- Revoke queued work if its requesting account lost write access before execution.
 update public.kalling_jobs pending set status='cancelled',last_error='Requesting member no longer has write access',lease_token=null,lease_until=null where status in ('queued','retry','running') and not exists(select 1 from public.kalling_members m where m.firm_id=pending.firm_id and m.user_id=pending.requested_by and m.active and m.role in ('owner','admin','analyst'));
 update public.kalling_jobs set status='failed',lease_token=null,lease_until=null,last_error='Retry limit reached after lease expiry' where status='running' and lease_until<now() and attempts>=max_attempts;
 select * into j from public.kalling_jobs where ((status in ('queued','retry') and available_at<=now()) or (status='running' and lease_until<now())) and attempts<max_attempts order by created_at for update skip locked limit 1;
 if j.id is null then return null; end if;
 update public.kalling_jobs set status='running',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes',checkpoint=jsonb_build_object('stage','claimed'),updated_at=now() where id=j.id returning * into j; return j;
end $$;
create function kalling_private.finish_job(p_job uuid,p_lease uuid,p_result jsonb,p_error text default null) returns boolean language plpgsql security definer set search_path='' as $$
declare j public.kalling_jobs; begin
 select * into j from public.kalling_jobs where id=p_job and status='running' and lease_token=p_lease and lease_until>now() for update;
 if j.id is null then return false; end if;
 update public.kalling_jobs set status=case when p_error is null then 'succeeded' when attempts>=max_attempts then 'failed' else 'retry' end,
 result=case when p_error is null then p_result else null end,last_error=left(p_error,500),checkpoint=jsonb_build_object('stage',case when p_error is null then 'completed' else 'retryable failure' end),available_at=now()+interval '1 minute'*power(2,j.attempts),lease_token=null,lease_until=null,updated_at=now() where id=j.id;
 insert into public.kalling_audit(firm_id,event,detail) values(j.firm_id,case when p_error is null then 'job.succeeded' else 'job.attempt_failed' end,jsonb_build_object('job_id',j.id,'attempt',j.attempts)); return true;
end $$;
create function kalling_private.tick() returns integer language plpgsql security definer set search_path='' as $$
declare j public.kalling_jobs; d jsonb; v bigint; results jsonb; total integer=0; begin
 -- Limit overlapping ticks and bound each invocation to five jobs. No network or paid tools.
 if not pg_try_advisory_xact_lock(872610101) then return 0; end if;
 for n in 1..5 loop
  j=kalling_private.claim_job(); exit when j.id is null;
  begin
   select data,version into d,v from public.kalling_workspaces where firm_id=j.firm_id;
   select coalesce(jsonb_agg(jsonb_build_object('deal_id',x->>'id','issue','Company reference missing')), '[]'::jsonb) into results from jsonb_array_elements(d->'deals') x where not exists(select 1 from jsonb_array_elements(d->'companies') c where c->>'id'=x->>'companyId');
   results=jsonb_build_object('workspace_version',v,'company_count',jsonb_array_length(d->'companies'),'deal_count',jsonb_array_length(d->'deals'),'issues',results,'scope','Record-reference checks only; not financial, security, or investment review');
   perform kalling_private.finish_job(j.id,j.lease_token,results); total=total+1;
  exception when others then
   -- Do not persist document text or potentially secret error messages.
   perform kalling_private.finish_job(j.id,j.lease_token,null,'Internal record check failed; inspect server logs');
  end;
 end loop;
 insert into public.kalling_worker_status(id,last_tick,processed) values('database-worker',now(),total) on conflict(id) do update set last_tick=excluded.last_tick,processed=excluded.processed;
 -- Bound ephemeral history, avoiding scheduler-log growth on the free tier.
 delete from public.kalling_jobs where status in ('succeeded','failed','cancelled') and updated_at<now()-interval '30 days';
 return total;
end $$;

-- Functions default to PUBLIC execution in Postgres: revoke it explicitly on every function.
revoke all on all functions in schema kalling_private from public,anon,authenticated;
grant execute on function kalling_private.role_for(uuid),kalling_private.can_upload(text),kalling_private.can_download(text) to authenticated;
revoke all on function public.kalling_create_firm(text,jsonb),public.kalling_save_workspace(uuid,bigint,jsonb,text),public.kalling_invite_member(uuid,text,text),public.kalling_accept_invite(text),public.kalling_set_member(uuid,uuid,text,boolean),public.kalling_reserve_document(uuid,text,text,text,bigint,uuid),public.kalling_finish_document(uuid),public.kalling_enqueue_job(uuid,text),public.kalling_cancel_job(uuid) from public,anon;
grant execute on function public.kalling_create_firm(text,jsonb),public.kalling_save_workspace(uuid,bigint,jsonb,text),public.kalling_invite_member(uuid,text,text),public.kalling_accept_invite(text),public.kalling_set_member(uuid,uuid,text,boolean),public.kalling_reserve_document(uuid,text,text,text,bigint,uuid),public.kalling_finish_document(uuid),public.kalling_enqueue_job(uuid,text),public.kalling_cancel_job(uuid) to authenticated;

create function public.kalling_list_invites(p_firm uuid) returns table(id uuid,email text,role text,expires_at timestamptz) language plpgsql security definer set search_path='' as $$
begin
 perform kalling_private.require_role(p_firm,array['owner','admin']);
 return query select i.id,i.email,i.role,i.expires_at from kalling_private.invites i where i.firm_id=p_firm and i.accepted_at is null and i.revoked_at is null and i.expires_at>now() order by i.expires_at;
end $$;
create function public.kalling_revoke_invite(p_firm uuid,p_invite uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform kalling_private.require_role(p_firm,array['owner','admin']);
 update kalling_private.invites set revoked_at=now() where firm_id=p_firm and id=p_invite and accepted_at is null;
 insert into public.kalling_audit(firm_id,actor_id,event,detail) values(p_firm,auth.uid(),'invitation.revoked',jsonb_build_object('invitation_id',p_invite));
end $$;
revoke all on function public.kalling_list_invites(uuid),public.kalling_revoke_invite(uuid,uuid) from public,anon;
grant execute on function public.kalling_list_invites(uuid),public.kalling_revoke_invite(uuid,uuid) to authenticated;

commit;
