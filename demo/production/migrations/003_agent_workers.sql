-- Kalling connected research computers. Apply once after 001/002 as postgres.
-- A paired computer (for the pilot: Karan's Mac running local Qwen through Ollama) claims
-- research and drafting assignments for exactly one firm. It authenticates with a random
-- worker token that is stored only as a SHA-256 hash. No service-role key leaves Supabase.
-- Results are proposals: the browser imports them into human review. Nothing is sent.
begin;

create table public.kalling_agent_workers (
 id uuid primary key default gen_random_uuid(), firm_id uuid not null references public.kalling_firms(id),
 name text not null check(length(name) between 2 and 80), created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(), last_seen_at timestamptz,
 state text not null default 'starting' check(state in ('starting','ready','busy','model-unavailable','paused')),
 detail text check(length(detail)<=300), version text check(length(version)<=40), model text check(length(model)<=40),
 revoked_at timestamptz
);
create index kalling_agent_workers_firm on public.kalling_agent_workers(firm_id) where revoked_at is null;
create table kalling_private.worker_tokens (
 worker_id uuid primary key references public.kalling_agent_workers(id), token_hash text not null unique
);
create table kalling_private.worker_pairings (
 id uuid primary key default gen_random_uuid(), firm_id uuid not null references public.kalling_firms(id),
 name text not null, code_hash text not null unique, created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '15 minutes',
 used_at timestamptz, worker_id uuid references public.kalling_agent_workers(id)
);
alter table kalling_private.worker_tokens enable row level security;
alter table kalling_private.worker_pairings enable row level security;
revoke all on kalling_private.worker_tokens,kalling_private.worker_pairings from public,anon,authenticated;

create table public.kalling_agent_jobs (
 id uuid primary key default gen_random_uuid(), firm_id uuid not null references public.kalling_firms(id),
 kind text not null check(kind in ('research','outreach')),
 company_id text not null check(length(company_id) between 1 and 100),
 assignment_id text not null check(length(assignment_id) between 8 and 120),
 -- Assignments and results are stored verbatim: jsonb would reorder keys and break content hashes.
 packet text not null check(octet_length(packet)<=120000),
 status text not null default 'queued' check(status in ('queued','running','retry','succeeded','failed','cancelled')),
 progress jsonb not null default '{}' check(octet_length(progress::text)<=4000),
 attempts integer not null default 0, max_attempts integer not null default 4 check(max_attempts between 1 and 6),
 available_at timestamptz not null default now(), worker_id uuid references public.kalling_agent_workers(id),
 lease_token uuid, lease_until timestamptz,
 result text check(result is null or octet_length(result)<=120000), last_error text,
 requested_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 started_at timestamptz, finished_at timestamptz,
 unique(firm_id,assignment_id)
);
create index kalling_agent_jobs_ready on public.kalling_agent_jobs(firm_id,created_at) where status in ('queued','retry','running');
create index kalling_agent_jobs_company on public.kalling_agent_jobs(firm_id,company_id,created_at);

alter table public.kalling_agent_workers enable row level security;
alter table public.kalling_agent_jobs enable row level security;
create policy agent_workers_read on public.kalling_agent_workers for select to authenticated using(kalling_private.role_for(firm_id) is not null);
create policy agent_jobs_read on public.kalling_agent_jobs for select to authenticated using(kalling_private.role_for(firm_id) is not null);
revoke all on public.kalling_agent_workers,public.kalling_agent_jobs from public,anon,authenticated;
grant select on public.kalling_agent_workers,public.kalling_agent_jobs to authenticated;

create function kalling_private.hash_secret(p text) returns text language sql immutable set search_path='' as $$
 select encode(sha256(convert_to(p,'UTF8')),'hex')
$$;

-- ── Browser (signed-in member) entrypoints ────────────────────────────────────────────
create function public.kalling_agent_enqueue(p_firm uuid,p_kind text,p_packet text) returns uuid language plpgsql security definer set search_path='' as $$
declare j uuid; d jsonb; a text; c text; begin
 perform kalling_private.require_role(p_firm,array['owner','admin','analyst']);
 if p_kind not in ('research','outreach') then raise exception 'Unsupported assignment type'; end if;
 if p_packet is null or octet_length(p_packet)>120000 then raise exception 'Assignment must be a JSON object under 120 KB'; end if;
 begin d=p_packet::jsonb; exception when others then raise exception 'Assignment must be a JSON object under 120 KB'; end;
 if jsonb_typeof(d)<>'object' then raise exception 'Assignment must be a JSON object under 120 KB'; end if;
 a=d->>'id'; c=d#>>'{company,id}';
 if d->>'playbook' is distinct from (array['local-research-v1','local-outreach-v1'])[array_position(array['research','outreach'],p_kind)] then raise exception 'Assignment playbook does not match its type'; end if;
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
create function public.kalling_agent_cancel(p_job uuid) returns void language plpgsql security definer set search_path='' as $$
declare f uuid; begin
 select firm_id into f from public.kalling_agent_jobs where id=p_job;
 perform kalling_private.require_role(f,array['owner','admin','analyst']);
 update public.kalling_agent_jobs set status='cancelled',lease_token=null,lease_until=null,finished_at=now(),updated_at=now(),
  progress=jsonb_build_object('stage','cancelled','at',now()) where id=p_job and status in ('queued','retry','running');
 insert into public.kalling_audit(firm_id,actor_id,event,detail) values(f,auth.uid(),'agent.cancelled',jsonb_build_object('job_id',p_job));
end $$;
create function public.kalling_agent_retry(p_job uuid) returns void language plpgsql security definer set search_path='' as $$
declare f uuid; begin
 select firm_id into f from public.kalling_agent_jobs where id=p_job;
 perform kalling_private.require_role(f,array['owner','admin','analyst']);
 update public.kalling_agent_jobs set status='queued',attempts=0,available_at=now(),last_error=null,worker_id=null,lease_token=null,lease_until=null,finished_at=null,updated_at=now(),
  progress=jsonb_build_object('stage','queued','at',now(),'retried',true) where id=p_job and status='failed';
 if not found then raise exception 'Only a failed assignment can be retried'; end if;
 insert into public.kalling_audit(firm_id,actor_id,event,detail) values(f,auth.uid(),'agent.retried',jsonb_build_object('job_id',p_job));
end $$;
create function public.kalling_agent_create_pairing(p_firm uuid,p_name text) returns text language plpgsql security definer set search_path='' as $$
declare code text; begin
 perform kalling_private.require_role(p_firm,array['owner','admin']);
 if coalesce(length(trim(p_name)),0) not between 2 and 80 then raise exception 'Name the computer in 2 to 80 characters'; end if;
 perform 1 from public.kalling_firms where id=p_firm for update;
 if (select count(*) from public.kalling_agent_workers where firm_id=p_firm and revoked_at is null)>=5 then raise exception 'Five connected computers is the pilot limit. Disconnect one first.'; end if;
 if (select count(*) from kalling_private.worker_pairings where firm_id=p_firm and used_at is null and expires_at>now())>=5 then raise exception 'Too many unused connection codes. Wait 15 minutes.'; end if;
 code=upper(substr(replace(gen_random_uuid()::text,'-',''),1,24));
 code=substr(code,1,6)||'-'||substr(code,7,6)||'-'||substr(code,13,6)||'-'||substr(code,19,6);
 insert into kalling_private.worker_pairings(firm_id,name,code_hash,created_by) values(p_firm,trim(p_name),kalling_private.hash_secret(code),auth.uid());
 insert into public.kalling_audit(firm_id,actor_id,event) values(p_firm,auth.uid(),'agent.pairing_created');
 return code;
end $$;
create function public.kalling_agent_revoke_worker(p_firm uuid,p_worker uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform kalling_private.require_role(p_firm,array['owner','admin']);
 update public.kalling_agent_workers set revoked_at=now() where id=p_worker and firm_id=p_firm and revoked_at is null;
 if not found then raise exception 'Computer not found in this firm'; end if;
 delete from kalling_private.worker_tokens where worker_id=p_worker;
 -- Work held by the disconnected computer becomes available to another paired computer.
 update public.kalling_agent_jobs set status='retry',lease_token=null,lease_until=null,available_at=now(),updated_at=now(),
  progress=jsonb_build_object('stage','waiting','at',now(),'reason','Computer disconnected') where worker_id=p_worker and status='running';
 insert into public.kalling_audit(firm_id,actor_id,event,detail) values(p_firm,auth.uid(),'agent.worker_revoked',jsonb_build_object('worker_id',p_worker));
end $$;

-- ── Paired-computer entrypoints (token gated; callable with the public key) ───────────
create function kalling_private.worker_auth(p_token text) returns public.kalling_agent_workers language plpgsql security definer set search_path='' as $$
declare w public.kalling_agent_workers; begin
 if coalesce(length(p_token),0)<>64 then raise exception 'Computer access denied' using errcode='42501'; end if;
 select wk.* into w from kalling_private.worker_tokens t join public.kalling_agent_workers wk on wk.id=t.worker_id
  where t.token_hash=kalling_private.hash_secret(p_token) and wk.revoked_at is null;
 -- A computer keeps authority only while the administrator who connected it still has it.
 if w.id is null or not exists(select 1 from public.kalling_members m where m.firm_id=w.firm_id and m.user_id=w.created_by and m.active and m.role in ('owner','admin')) then
  raise exception 'Computer access denied' using errcode='42501'; end if;
 update public.kalling_agent_workers set last_seen_at=now() where id=w.id;
 return w;
end $$;
create function public.kalling_worker_pair(p_code text,p_version text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare pr kalling_private.worker_pairings; w uuid; token text; begin
 select * into pr from kalling_private.worker_pairings where code_hash=kalling_private.hash_secret(upper(trim(coalesce(p_code,'')))) and used_at is null and expires_at>now() for update;
 if pr.id is null or not exists(select 1 from public.kalling_members m where m.firm_id=pr.firm_id and m.user_id=pr.created_by and m.active and m.role in ('owner','admin')) then
  raise exception 'This connection code is invalid or expired. Create a new one in Kalling.' using errcode='42501'; end if;
 insert into public.kalling_agent_workers(firm_id,name,created_by,last_seen_at,version) values(pr.firm_id,pr.name,pr.created_by,now(),left(p_version,40)) returning id into w;
 token=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
 insert into kalling_private.worker_tokens(worker_id,token_hash) values(w,kalling_private.hash_secret(token));
 update kalling_private.worker_pairings set used_at=now(),worker_id=w where id=pr.id;
 insert into public.kalling_audit(firm_id,actor_id,event,detail) values(pr.firm_id,pr.created_by,'agent.worker_paired',jsonb_build_object('worker_id',w));
 return jsonb_build_object('worker_id',w,'token',token,'firm_id',pr.firm_id,'firm_name',(select name from public.kalling_firms where id=pr.firm_id),'name',pr.name);
end $$;
create function public.kalling_worker_heartbeat(p_token text,p_state text,p_detail text default null,p_version text default null,p_model text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare w public.kalling_agent_workers; begin
 w=kalling_private.worker_auth(p_token);
 if p_state not in ('starting','ready','busy','model-unavailable','paused') then raise exception 'Unknown computer state'; end if;
 update public.kalling_agent_workers set state=p_state,detail=left(p_detail,300),version=left(coalesce(p_version,version),40),model=left(coalesce(p_model,model),40) where id=w.id;
 return jsonb_build_object('worker_id',w.id,'firm_id',w.firm_id,'firm_name',(select name from public.kalling_firms where id=w.firm_id),'name',w.name,
  'waiting',(select count(*) from public.kalling_agent_jobs where firm_id=w.firm_id and status in ('queued','retry')));
end $$;
create function public.kalling_worker_claim(p_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare w public.kalling_agent_workers; j public.kalling_agent_jobs; begin
 w=kalling_private.worker_auth(p_token);
 -- Work requested by someone who lost write access is never executed.
 update public.kalling_agent_jobs pending set status='cancelled',last_error='Requesting member no longer has write access',lease_token=null,lease_until=null,finished_at=now(),updated_at=now()
  where pending.firm_id=w.firm_id and status in ('queued','retry','running') and not exists(select 1 from public.kalling_members m where m.firm_id=pending.firm_id and m.user_id=pending.requested_by and m.active and m.role in ('owner','admin','analyst'));
 update public.kalling_agent_jobs set status='failed',lease_token=null,lease_until=null,finished_at=now(),updated_at=now(),last_error='The research computer stopped responding too many times',
  progress=jsonb_build_object('stage','failed','at',now()) where firm_id=w.firm_id and status='running' and lease_until<now() and attempts>=max_attempts;
 -- After a restart, the same computer resumes the assignment it already holds.
 select * into j from public.kalling_agent_jobs where firm_id=w.firm_id and worker_id=w.id and status='running' and lease_until>=now() order by started_at limit 1 for update;
 if j.id is not null then
  update public.kalling_agent_jobs set lease_until=now()+interval '3 minutes',updated_at=now() where id=j.id returning * into j;
 else
  select * into j from public.kalling_agent_jobs where firm_id=w.firm_id and ((status in ('queued','retry') and available_at<=now()) or (status='running' and lease_until<now())) and attempts<max_attempts order by created_at for update skip locked limit 1;
  if j.id is null then return null; end if;
  update public.kalling_agent_jobs set status='running',attempts=attempts+1,worker_id=w.id,lease_token=gen_random_uuid(),lease_until=now()+interval '3 minutes',
   started_at=coalesce(started_at,now()),updated_at=now(),progress=jsonb_build_object('stage','starting','at',now(),'worker',w.name) where id=j.id returning * into j;
  insert into public.kalling_audit(firm_id,event,detail) values(j.firm_id,'agent.claimed',jsonb_build_object('job_id',j.id,'worker_id',w.id,'attempt',j.attempts));
 end if;
 update public.kalling_agent_workers set state='busy' where id=w.id;
 delete from public.kalling_agent_jobs where firm_id=w.firm_id and status in ('succeeded','failed','cancelled') and updated_at<now()-interval '30 days';
 return jsonb_build_object('id',j.id,'kind',j.kind,'packet',j.packet,'lease_token',j.lease_token,'attempts',j.attempts,'max_attempts',j.max_attempts);
end $$;
create function kalling_private.worker_job(w public.kalling_agent_workers,p_job uuid,p_lease uuid) returns text language plpgsql security definer set search_path='' as $$
declare j public.kalling_agent_jobs; begin
 select * into j from public.kalling_agent_jobs where id=p_job and firm_id=w.firm_id for update;
 if j.id is null then return 'lost'; end if;
 if j.status='cancelled' then return 'cancelled'; end if;
 -- The lease token is the fence: a computer that slept past its lease may continue only until
 -- another claim replaces the token. Expiry alone makes the work claimable, not void.
 if j.status<>'running' or j.lease_token is distinct from p_lease or j.worker_id is distinct from w.id then return 'lost'; end if;
 return 'ok';
end $$;
create function public.kalling_worker_progress(p_token text,p_job uuid,p_lease uuid,p_progress jsonb) returns text language plpgsql security definer set search_path='' as $$
declare w public.kalling_agent_workers; s text; begin
 w=kalling_private.worker_auth(p_token); s=kalling_private.worker_job(w,p_job,p_lease);
 if s<>'ok' then return s; end if;
 if p_progress is null or jsonb_typeof(p_progress)<>'object' or octet_length(p_progress::text)>3000 then raise exception 'Progress must be a small JSON object'; end if;
 update public.kalling_agent_jobs set progress=p_progress||jsonb_build_object('at',now(),'worker',w.name),lease_until=now()+interval '3 minutes',updated_at=now() where id=p_job;
 return 'ok';
end $$;
create function public.kalling_worker_finish(p_token text,p_job uuid,p_lease uuid,p_result text,p_error text default null,p_retryable boolean default true) returns text language plpgsql security definer set search_path='' as $$
declare w public.kalling_agent_workers; s text; j public.kalling_agent_jobs; r jsonb; begin
 w=kalling_private.worker_auth(p_token); s=kalling_private.worker_job(w,p_job,p_lease);
 if s<>'ok' then return s; end if;
 select * into j from public.kalling_agent_jobs where id=p_job;
 if p_error is null then
  begin r=p_result::jsonb; exception when others then r=null; end;
  if r is null or jsonb_typeof(r)<>'object' or r->>'id' is distinct from j.assignment_id or r->>'executionPolicy' is distinct from 'local-only-required-v2' or octet_length(p_result)>120000 then
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

revoke all on all functions in schema kalling_private from public,anon,authenticated;
grant execute on function kalling_private.role_for(uuid),kalling_private.can_upload(text),kalling_private.can_download(text) to authenticated;
revoke all on function public.kalling_agent_enqueue(uuid,text,text),public.kalling_agent_cancel(uuid),public.kalling_agent_retry(uuid),public.kalling_agent_create_pairing(uuid,text),public.kalling_agent_revoke_worker(uuid,uuid) from public,anon;
grant execute on function public.kalling_agent_enqueue(uuid,text,text),public.kalling_agent_cancel(uuid),public.kalling_agent_retry(uuid),public.kalling_agent_create_pairing(uuid,text),public.kalling_agent_revoke_worker(uuid,uuid) to authenticated;
revoke all on function public.kalling_worker_pair(text,text),public.kalling_worker_heartbeat(text,text,text,text,text),public.kalling_worker_claim(text),public.kalling_worker_progress(text,uuid,uuid,jsonb),public.kalling_worker_finish(text,uuid,uuid,text,text,boolean) from public;
grant execute on function public.kalling_worker_pair(text,text),public.kalling_worker_heartbeat(text,text,text,text,text),public.kalling_worker_claim(text),public.kalling_worker_progress(text,uuid,uuid,jsonb),public.kalling_worker_finish(text,uuid,uuid,text,text,boolean) to anon,authenticated;
commit;
