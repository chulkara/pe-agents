-- Authenticated closing files use current tickets for metadata and bytes.
-- Resumable upload fingerprints are scoped to the transaction and uploader.
begin;

create or replace function public.kalling_execution_file_prepare(p_transaction uuid,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
 declare t kalling_private.execution_transactions;i uuid=gen_random_uuid();fam uuid=coalesce(nullif(p->>'family','')::uuid,gen_random_uuid());v integer;path text;r text;old kalling_private.execution_files;arrived boolean=false;begin
 select * into t from kalling_private.execution_transactions where id=p_transaction for update;r=kalling_private.execution_role(t.id);
 if r is null or r='viewer' or t.state='Abandoned' or (t.state='Closed' and (r<>'advisor' or p->>'kind' is distinct from 'Closing evidence')) then raise exception 'Document upload is not permitted' using errcode='42501';end if;
 if not (p ?& array['name','mime','size','sha256','kind','content']) or not kalling_private.execution_safe(p->>'name',1,200) or p->>'mime' is distinct from 'application/pdf' or (p->>'size')::bigint not between 1 and 10485760 or p->>'sha256'!~'^[0-9a-f]{64}$' or coalesce(p->>'kind','') not in ('LOI','Diligence','Closing evidence','Lease','License','Other') or coalesce(p->>'content','') not in ('Confidential','Named counterparties','Restricted lender') then raise exception 'Use a PDF no larger than 10 MB and choose its purpose.';end if;
 if p ? 'retryKey' then
  if coalesce(p->>'retryKey','')!~'^[0-9a-f]{64}$' then raise exception 'Use a valid upload retry fingerprint.';end if;
  select * into old from kalling_private.execution_files f where f.transaction_id=t.id and f.uploaded_by=auth.uid()
   and f.portal_file_id is null and f.data->>'retryKey'=p->>'retryKey' order by f.created_at desc limit 1 for update;
  if old.id is not null then
   if old.data->>'name' is distinct from p->>'name' or old.data->>'mime' is distinct from p->>'mime'
    or (old.data->>'size')::bigint is distinct from (p->>'size')::bigint or old.data->>'sha256' is distinct from p->>'sha256'
    or old.data->>'kind' is distinct from p->>'kind' or old.data->>'content' is distinct from p->>'content'
    or nullif(p->>'family','') is not null and old.family is distinct from (p->>'family')::uuid then
    raise exception 'The retry must match the original document and classification.';end if;
   arrived=exists(select 1 from storage.objects o where o.bucket_id='kalling-execution' and o.name=old.object_path
    and (o.metadata->>'size')::bigint=(old.data->>'size')::bigint and o.metadata->>'mimetype'=old.data->>'mime');
   if exists(select 1 from storage.objects o where o.bucket_id='kalling-execution' and o.name=old.object_path) and not arrived
    or old.status='Stored' and not arrived then raise exception 'The stored original is unavailable or its metadata changed. Contact the advisor.';end if;
   return jsonb_build_object('id',old.id,'path',old.object_path,'stored',old.status='Stored','uploaded',arrived);
  end if;
 end if;
 select coalesce(max(version),0)+1 into v from kalling_private.execution_files where transaction_id=t.id and family=fam;
 path=t.id::text||'/'||i::text||'.pdf';insert into kalling_private.execution_files(id,transaction_id,family,version,object_path,status,uploaded_by,data) values(i,t.id,fam,v,path,'Reserved',auth.uid(),jsonb_build_object('name',p->>'name','mime','application/pdf','size',(p->>'size')::bigint,'sha256',p->>'sha256','kind',p->>'kind','content',p->>'content','uploadedBy',r,'retryKey',p->>'retryKey'));return jsonb_build_object('id',i,'path',path,'stored',false,'uploaded',false);end $$;

create or replace function kalling_private.execution_upload_ok(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(
  select 1 from kalling_private.execution_files f join kalling_private.execution_transactions t on t.id=f.transaction_id
  where f.object_path=p_path and f.status='Reserved' and f.uploaded_by=auth.uid() and f.created_at>now()-interval '1 day'
   and kalling_private.execution_role(t.id) is not null and kalling_private.execution_role(t.id)<>'viewer'
   and (t.state in ('Planning','LOI reviewed') or t.state='Closed' and kalling_private.execution_role(t.id)='advisor' and f.data->>'kind'='Closing evidence'))
$$;

create or replace function kalling_private.execution_ticket_ok(p_path text) returns boolean language plpgsql volatile security definer set search_path='' as $$
 declare f kalling_private.execution_files;ok boolean=false;begin
 if auth.uid() is null then return false;end if;
 select x.* into f from kalling_private.execution_files x join kalling_private.execution_events e on e.file_id=x.id and e.object_path=x.object_path where e.actor=auth.uid() and e.event='opened' and e.ticket is not null and e.at>now()-interval '2 minutes' and e.at<=now() and e.object_path=p_path order by e.at desc limit 1;
 if f.id is null then return false;end if;
 ok=kalling_private.execution_file_allowed(f.id) and exists(select 1 from kalling_private.execution_events e where e.file_id=f.id and e.actor=auth.uid() and e.event='opened' and e.ticket is not null and e.grant_revision=f.permission_revision and e.at>now()-interval '2 minutes' and e.at<=now());
 if not ok and storage.allow_any_operation(array['object.get_authenticated_info','object.get_authenticated']) and not exists(select 1 from kalling_private.execution_events e where e.file_id=f.id and e.actor=auth.uid() and e.event='denied' and e.at>now()-interval '1 minute') then insert into kalling_private.execution_events(transaction_id,file_id,actor,event,note) values(f.transaction_id,f.id,auth.uid(),'denied','Current document or transaction authorization no longer permits this read.');end if;return ok;end $$;

alter policy execution_file_read on storage.objects using(
 bucket_id in ('kalling-execution','kalling-portal')
 and storage.allow_any_operation(array['object.get_authenticated_info','object.get_authenticated'])
 and kalling_private.execution_ticket_ok(name)
);
comment on function kalling_private.execution_upload_ok(text) is 'Current uploader and transaction permission; closed archives accept only advisor closing evidence.';
comment on function kalling_private.execution_ticket_ok(text) is 'Logged two-minute ticket, current file grant revision and current transaction access for authenticated metadata and byte reads.';
-- Reviewers can verify the persisted read/denial record without exposing the
-- private event table, storage paths, or notes to buyers and specialists.
create function public.kalling_execution_file_audit(p_transaction uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if kalling_private.execution_role(p_transaction) is distinct from 'advisor' then raise exception 'File audit access denied' using errcode='42501';end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'fileId',e.file_id,'actor',e.actor,'event',e.event,'at',e.at,'ticket',e.ticket,'permissionRevision',e.grant_revision) order by e.at,e.id),'[]') from (select * from kalling_private.execution_events where transaction_id=p_transaction and file_id is not null order by at desc,id desc limit 1000) e);
end $$;
revoke all on function public.kalling_execution_file_audit(uuid) from public,anon;
grant execute on function public.kalling_execution_file_audit(uuid) to authenticated;

commit;
