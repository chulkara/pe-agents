-- Kalling: AI drafting on the research computer. Apply after 003 and 004.
-- Adds four assignment types (recast, teaser, cim, comps), larger packets for the two that carry
-- document text, a version gate so an old worker never claims work it cannot do, and a private
-- table for text extracted from the owner's documents. Only firm members can read that text.
begin;

alter table public.kalling_agent_jobs drop constraint kalling_agent_jobs_kind_check;
alter table public.kalling_agent_jobs add constraint kalling_agent_jobs_kind_check check(kind in ('research','outreach','recast','teaser','cim','comps'));
alter table public.kalling_agent_jobs drop constraint kalling_agent_jobs_packet_check;
alter table public.kalling_agent_jobs add constraint kalling_agent_jobs_packet_check check(octet_length(packet)<=case when kind in ('recast','cim') then 600000 else 120000 end);
alter table public.kalling_agent_jobs drop constraint kalling_agent_jobs_result_check;
alter table public.kalling_agent_jobs add constraint kalling_agent_jobs_result_check check(result is null or octet_length(result)<=400000);

create function kalling_private.job_playbook(p_kind text) returns text language sql immutable set search_path='' as $$
 select (array['local-research-v1','local-outreach-v1','local-recast-v1','local-teaser-v1','local-cim-v1','local-comps-v1'])[array_position(array['research','outreach','recast','teaser','cim','comps'],p_kind)]
$$;
create function kalling_private.job_limit(p_kind text) returns integer language sql immutable set search_path='' as $$
 select case when p_kind in ('recast','cim') then 600000 else 120000 end
$$;
-- Workers before kalling-worker-2 only know research and outreach.
create function kalling_private.worker_supports(p_version text,p_kind text) returns boolean language sql immutable set search_path='' as $$
 select p_kind in ('research','outreach') or coalesce(substring(p_version from 'kalling-worker-(\d+)')::int,0)>=2
$$;

create or replace function public.kalling_agent_enqueue(p_firm uuid,p_kind text,p_packet text) returns uuid language plpgsql security definer set search_path='' as $$
declare j uuid; d jsonb; a text; c text; lim integer; begin
 perform kalling_private.require_role(p_firm,array['owner','admin','analyst']);
 if kalling_private.job_playbook(p_kind) is null then raise exception 'Unsupported assignment type'; end if;
 lim=kalling_private.job_limit(p_kind);
 if p_packet is null or octet_length(p_packet)>lim then raise exception 'Assignment must be a JSON object under % KB',lim/1000; end if;
 begin d=p_packet::jsonb; exception when others then raise exception 'Assignment must be a JSON object under % KB',lim/1000; end;
 if jsonb_typeof(d)<>'object' then raise exception 'Assignment must be a JSON object under % KB',lim/1000; end if;
 a=d->>'id'; c=d#>>'{company,id}';
 if d->>'playbook' is distinct from kalling_private.job_playbook(p_kind) then raise exception 'Assignment playbook does not match its type'; end if;
 if coalesce(length(a),0) not between 8 and 120 or coalesce(length(c),0) not between 1 and 100 then raise exception 'Assignment identifiers are missing'; end if;
 perform 1 from public.kalling_firms where id=p_firm for update;
 if not exists(select 1 from public.kalling_workspaces w,jsonb_array_elements(w.data->'companies') x where w.firm_id=p_firm and x->>'id'=c) then raise exception 'Company not in this firm'; end if;
 select id into j from public.kalling_agent_jobs where firm_id=p_firm and assignment_id=a;
 if j is not null then return j; end if;
 if (select count(*) from public.kalling_agent_jobs where firm_id=p_firm and status in ('queued','retry','running'))>=10 then raise exception 'Ten assignments are already waiting. Let them finish or cancel one first.'; end if;
 if (select count(*) from public.kalling_agent_jobs where firm_id=p_firm and created_at>now()-interval '1 day')>=40 then raise exception '40 assignments per firm per day pilot limit reached'; end if;
 insert into public.kalling_agent_jobs(firm_id,kind,company_id,assignment_id,packet,requested_by,progress)
  values(p_firm,p_kind,c,a,p_packet,auth.uid(),jsonb_build_object('stage','queued','at',now())) returning id into j;
 insert into public.kalling_audit(firm_id,actor_id,event,detail) values(p_firm,auth.uid(),'agent.queued',jsonb_build_object('job_id',j,'kind',p_kind,'company_id',c));
 return j;
end $$;

create or replace function public.kalling_worker_claim(p_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare w public.kalling_agent_workers; j public.kalling_agent_jobs; begin
 w=kalling_private.worker_auth(p_token);
 update public.kalling_agent_jobs pending set status='cancelled',last_error='Requesting member no longer has write access',lease_token=null,lease_until=null,finished_at=now(),updated_at=now()
  where pending.firm_id=w.firm_id and status in ('queued','retry','running') and not exists(select 1 from public.kalling_members m where m.firm_id=pending.firm_id and m.user_id=pending.requested_by and m.active and m.role in ('owner','admin','analyst'));
 update public.kalling_agent_jobs set status='failed',lease_token=null,lease_until=null,finished_at=now(),updated_at=now(),last_error='The research computer stopped responding too many times',
  progress=jsonb_build_object('stage','failed','at',now()) where firm_id=w.firm_id and status='running' and lease_until<now() and attempts>=max_attempts;
 select * into j from public.kalling_agent_jobs where firm_id=w.firm_id and worker_id=w.id and status='running' and lease_until>=now() order by started_at limit 1 for update;
 if j.id is not null then
  update public.kalling_agent_jobs set lease_until=now()+interval '3 minutes',updated_at=now() where id=j.id returning * into j;
 else
  select * into j from public.kalling_agent_jobs where firm_id=w.firm_id and ((status in ('queued','retry') and available_at<=now()) or (status='running' and lease_until<now())) and attempts<max_attempts
   and kalling_private.worker_supports(w.version,kind) order by created_at for update skip locked limit 1;
  if j.id is null then return null; end if;
  update public.kalling_agent_jobs set status='running',attempts=attempts+1,worker_id=w.id,lease_token=gen_random_uuid(),lease_until=now()+interval '3 minutes',
   started_at=coalesce(started_at,now()),updated_at=now(),progress=jsonb_build_object('stage','starting','at',now(),'worker',w.name) where id=j.id returning * into j;
  insert into public.kalling_audit(firm_id,event,detail) values(j.firm_id,'agent.claimed',jsonb_build_object('job_id',j.id,'worker_id',w.id,'attempt',j.attempts));
 end if;
 update public.kalling_agent_workers set state='busy' where id=w.id;
 delete from public.kalling_agent_jobs where firm_id=w.firm_id and status in ('succeeded','failed','cancelled') and updated_at<now()-interval '30 days';
 return jsonb_build_object('id',j.id,'kind',j.kind,'packet',j.packet,'lease_token',j.lease_token,'attempts',j.attempts,'max_attempts',j.max_attempts);
end $$;

create or replace function public.kalling_worker_finish(p_token text,p_job uuid,p_lease uuid,p_result text,p_error text default null,p_retryable boolean default true) returns text language plpgsql security definer set search_path='' as $$
declare w public.kalling_agent_workers; s text; j public.kalling_agent_jobs; r jsonb; begin
 w=kalling_private.worker_auth(p_token); s=kalling_private.worker_job(w,p_job,p_lease);
 if s<>'ok' then return s; end if;
 select * into j from public.kalling_agent_jobs where id=p_job;
 if p_error is null then
  begin r=p_result::jsonb; exception when others then r=null; end;
  if r is null or jsonb_typeof(r)<>'object' or r->>'id' is distinct from j.assignment_id or r->>'executionPolicy' is distinct from 'local-only-required-v2' or octet_length(p_result)>400000 then
   raise exception 'Result does not belong to this assignment or is not a local-only result'; end if;
  update public.kalling_agent_jobs set status='succeeded',result=p_result,last_error=null,lease_token=null,lease_until=null,finished_at=now(),updated_at=now(),
   progress=jsonb_build_object('stage','ready-for-review','at',now(),'worker',w.name) where id=p_job;
  insert into public.kalling_audit(firm_id,event,detail) values(j.firm_id,'agent.succeeded',jsonb_build_object('job_id',j.id,'worker_id',w.id));
 else
  update public.kalling_agent_jobs set status=case when p_retryable and attempts<max_attempts then 'retry' else 'failed' end,
   last_error=left(p_error,500),lease_token=null,lease_until=null,worker_id=case when p_retryable then null else worker_id end,
   available_at=now()+interval '30 seconds'*power(2,greatest(attempts-1,0)),finished_at=case when p_retryable and attempts<max_attempts then null else now() end,updated_at=now(),
   progress=jsonb_build_object('stage',case when p_retryable and attempts<max_attempts then 'waiting' else 'failed' end,'at',now(),'reason',left(p_error,300)) where id=p_job;
  insert into public.kalling_audit(firm_id,event,detail) values(j.firm_id,'agent.attempt_failed',jsonb_build_object('job_id',j.id,'worker_id',w.id,'attempt',j.attempts));
 end if;
 update public.kalling_agent_workers set state='ready' where id=w.id;
 return 'ok';
end $$;

-- Text read from the owner's documents, page by page. Firm members only; owners see file names, never this text.
create table public.kalling_portal_file_text (
 file_id uuid primary key references public.kalling_portal_files(id) on delete cascade,
 portal_id uuid not null references public.kalling_portals(id),
 status text not null check(status in ('ok','scanned','unsupported','failed')),
 pages jsonb not null default '[]' check(jsonb_typeof(pages)='array' and octet_length(pages::text)<=450000),
 text_hash text not null check(text_hash~'^[0-9a-f]{64}$'), extractor text not null check(length(extractor)<=40), note text not null default '' check(length(note)<=400),
 extracted_by uuid not null references auth.users(id), extracted_at timestamptz not null default now()
);
alter table public.kalling_portal_file_text enable row level security;
create policy portal_file_text_read on public.kalling_portal_file_text for select to authenticated using(kalling_private.portal_role(portal_id) in ('firm-write','firm-read'));
revoke all on public.kalling_portal_file_text from public,anon,authenticated;
grant select on public.kalling_portal_file_text to authenticated;
create function public.kalling_portal_save_text(p_file uuid,p_extract jsonb) returns void language plpgsql security definer set search_path='' as $$
declare f public.kalling_portal_files; begin
 select * into f from public.kalling_portal_files where id=p_file and status='stored';
 if f.id is null then raise exception 'File not found.'; end if;
 perform kalling_private.portal_need(f.portal_id,array['firm-write']);
 insert into public.kalling_portal_file_text(file_id,portal_id,status,pages,text_hash,extractor,note,extracted_by)
 values(f.id,f.portal_id,p_extract->>'status',coalesce(p_extract->'pages','[]'),p_extract->>'textHash',left(coalesce(p_extract->>'extractor',''),40),left(coalesce(p_extract->>'note',''),400),auth.uid())
 on conflict(file_id) do update set status=excluded.status,pages=excluded.pages,text_hash=excluded.text_hash,extractor=excluded.extractor,note=excluded.note,extracted_by=excluded.extracted_by,extracted_at=now();
end $$;

revoke all on function kalling_private.job_playbook(text),kalling_private.job_limit(text),kalling_private.worker_supports(text,text) from public,anon,authenticated;
revoke all on function public.kalling_portal_save_text(uuid,jsonb) from public,anon;
grant execute on function public.kalling_portal_save_text(uuid,jsonb) to authenticated;
commit;
