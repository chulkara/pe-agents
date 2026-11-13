begin;
alter table public.kalling_agent_jobs drop constraint kalling_agent_jobs_kind_check;
alter table public.kalling_agent_jobs add constraint kalling_agent_jobs_kind_check check(kind in ('research','outreach','recast','teaser','cim','comps','execution'));
create or replace function kalling_private.job_playbook(p_kind text) returns text language sql immutable set search_path='' as $$
 select (array['local-research-v1','local-outreach-v1','local-recast-v1','local-teaser-v1','local-cim-v1','local-comps-v1','local-execution-v1'])[array_position(array['research','outreach','recast','teaser','cim','comps','execution'],p_kind)]
$$;
create or replace function kalling_private.worker_supports(p_version text,p_kind text) returns boolean language sql immutable set search_path='' as $$
 select case when p_kind='execution' then coalesce(substring(p_version from 'kalling-worker-(\d+)')::int,0)>=3 else p_kind in ('research','outreach') or coalesce(substring(p_version from 'kalling-worker-(\d+)')::int,0)>=2 end
$$;
create function kalling_private.execution_job_input() returns trigger language plpgsql security definer set search_path='' as $$
 declare p jsonb;d jsonb;t kalling_private.execution_transactions;s jsonb;f kalling_private.execution_files;key text;begin
 if new.kind<>'execution' then return new;end if;p=new.packet::jsonb;d=p->'data';
 select * into t from kalling_private.execution_transactions where id=(d->>'transactionId')::uuid for share;
 if kalling_private.execution_role(t.id) is distinct from 'advisor' or t.firm_id<>new.firm_id or t.data->>'companyId'<>p#>>'{company,id}' or (d->>'revision')::integer is distinct from t.revision or (d->>'permissionReviewed')::boolean is distinct from true or coalesce(d->>'purpose','') not in ('Status summary','Diligence follow-up','LOI questions','Case-study outline','Comparable explanation') or jsonb_typeof(d->'passages') is distinct from 'array' or jsonb_array_length(d->'passages') not between 1 and 12 then raise exception 'Review the current transaction, purpose and expressly permitted passages before queueing a proposal.';end if;
 for key in select jsonb_object_keys(p) loop if key not in ('version','playbook','kind','id','scopeId','inputHash','company','data') then raise exception 'Only the approved minimal assignment snapshot is permitted.';end if;end loop;
 for key in select jsonb_object_keys(d) loop if key not in ('transactionId','revision','purpose','passages','permissionReviewed') then raise exception 'Whole documents and unrelated transaction data are excluded from this assignment.';end if;end loop;
 for s in select * from jsonb_array_elements(d->'passages') loop
 select * into f from kalling_private.execution_files where id=(s#>>'{source,fileId}')::uuid and transaction_id=t.id;
 if f.id is null or f.review is null or f.data->>'content'='Restricted lender' or not kalling_private.execution_source(t.id,s->'source') or f.data->>'sha256' is distinct from s->>'sha256' or not kalling_private.execution_safe(s#>>'{source,excerpt}',5,5000) then raise exception 'An input passage is restricted, unreviewed, sensitive or no longer current.';end if;
 for key in select jsonb_object_keys(s) loop if key not in ('id','source','sha256') then raise exception 'Unapproved model input fields are excluded.';end if;end loop;end loop;return new;end $$;
create trigger execution_job_input before insert on public.kalling_agent_jobs for each row execute function kalling_private.execution_job_input();
create function kalling_private.execution_cancel_stale_jobs() returns trigger language plpgsql security definer set search_path='' as $$ begin
 update public.kalling_agent_jobs set status='cancelled',last_error='Transaction or permitted source snapshot changed',lease_token=null,lease_until=null,finished_at=now(),updated_at=now() where kind='execution' and firm_id=new.firm_id and status in ('queued','running','retry') and packet::jsonb#>>'{data,transactionId}'=new.id::text and packet::jsonb#>>'{data,revision}' is distinct from new.revision::text;return new;end $$;
create trigger execution_cancel_stale_jobs after update on kalling_private.execution_transactions for each row execute function kalling_private.execution_cancel_stale_jobs();
create function public.kalling_execution_draft_packets(p_transaction uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$ begin
 if kalling_private.execution_role(p_transaction) not in ('advisor','viewer') or kalling_private.execution_role(p_transaction) is null then raise exception 'Model proposal access denied' using errcode='42501';end if;
 return (select coalesce(jsonb_agg(x.packet::jsonb),'[]') from(select packet from public.kalling_agent_jobs where kind='execution' and packet::jsonb#>>'{data,transactionId}'=p_transaction::text order by created_at desc limit 20) x);end $$;
revoke all on function kalling_private.execution_job_input(),kalling_private.execution_cancel_stale_jobs() from public,anon,authenticated;
revoke all on function public.kalling_execution_draft_packets(uuid) from public,anon;grant execute on function public.kalling_execution_draft_packets(uuid) to authenticated;
commit;

