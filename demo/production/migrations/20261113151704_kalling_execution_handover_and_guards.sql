begin;

alter table kalling_private.execution_files add column permission_revision integer not null default 1;

alter table kalling_private.execution_events add column grant_revision integer;

alter table kalling_private.execution_participants add column invited_by uuid references auth.users(id);

create or replace function public.kalling_execution_invite(p_transaction uuid,p jsonb) returns text language plpgsql security definer set search_path='' as $$
 declare t kalling_private.execution_transactions;token text=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');begin
 select * into t from kalling_private.execution_transactions where id=p_transaction for update;
 if kalling_private.execution_role(t.id) is distinct from 'advisor' or t.state in ('Closed','Abandoned') then raise exception 'Invitation access denied' using errcode='42501';end if;
 if not coalesce((p->>'recipientReviewed')::boolean,false) or p->>'email'!~'^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' or p->>'role' not in ('Lawyer','CPA','Lender','Other specialist') or not kalling_private.execution_safe(p->>'name',2,120) or not kalling_private.execution_safe(p->>'purpose',10,600) or not kalling_private.execution_safe(p->>'coordinator',2,120) or (p->>'expiresAt')::timestamptz<=now() or (p->>'expiresAt')::timestamptz>now()+interval '90 days' then raise exception 'Review the recipient, role, purpose, internal coordinator and expiry.';end if;
 insert into kalling_private.execution_participants(transaction_id,email,name,role,purpose,coordinator,status,expires_at,token_hash,identity_allowed,invited_by) values(t.id,lower(p->>'email'),p->>'name',p->>'role',p->>'purpose',p->>'coordinator','Pending',(p->>'expiresAt')::timestamptz,md5(token),coalesce((p->>'identityAllowed')::boolean,false),auth.uid());
 perform kalling_private.execution_save(t,t.data-'closePackage','Specialist invitation prepared','Recipient reviewed; no message sent.');return token;end $$;

create or replace function public.kalling_execution_accept_invite(p_token text) returns uuid language plpgsql security definer set search_path='' as $$
 declare p kalling_private.execution_participants;begin
 select * into p from kalling_private.execution_participants where token_hash=md5(p_token) for update;
 if not exists(select 1 from kalling_private.execution_transactions t join public.kalling_members m on m.firm_id=t.firm_id and m.user_id=p.invited_by and m.active and m.role in ('owner','admin','analyst') where t.id=p.transaction_id) or p.id is null or p.status<>'Pending' or p.expires_at<=now() or p.accepted_at is not null or not exists(select 1 from auth.users u where u.id=auth.uid() and lower(u.email)=p.email and u.email_confirmed_at is not null) or not exists(select 1 from kalling_private.execution_transactions t where t.id=p.transaction_id and t.state in ('Planning','LOI reviewed')) then raise exception 'This invitation is expired, used, revoked or belongs to another email.';end if;
 update kalling_private.execution_participants set user_id=auth.uid(),status='Active',accepted_at=now() where id=p.id;return p.transaction_id;end $$;

create or replace function public.kalling_execution_file_prepare(p_transaction uuid,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
 declare t kalling_private.execution_transactions;i uuid=gen_random_uuid();fam uuid=coalesce(nullif(p->>'family','')::uuid,gen_random_uuid());v integer;path text;r text;begin
 select * into t from kalling_private.execution_transactions where id=p_transaction for update;r=kalling_private.execution_role(t.id);
 if r is null or r='viewer' or t.state='Abandoned' or (t.state='Closed' and (r<>'advisor' or p->>'kind' is distinct from 'Closing evidence')) then raise exception 'Document upload is not permitted' using errcode='42501';end if;
 if not (p ?& array['name','mime','size','sha256','kind','content']) or not kalling_private.execution_safe(p->>'name',1,200) or p->>'mime' is distinct from 'application/pdf' or (p->>'size')::bigint not between 1 and 10485760 or p->>'sha256'!~'^[0-9a-f]{64}$' or coalesce(p->>'kind','') not in ('LOI','Diligence','Closing evidence','Lease','License','Other') or coalesce(p->>'content','') not in ('Confidential','Named counterparties','Restricted lender') then raise exception 'Use a PDF no larger than 10 MB and choose its purpose.';end if;
 select coalesce(max(version),0)+1 into v from kalling_private.execution_files where transaction_id=t.id and family=fam;
 path=t.id::text||'/'||i::text||'.pdf';insert into kalling_private.execution_files(id,transaction_id,family,version,object_path,status,uploaded_by,data) values(i,t.id,fam,v,path,'Reserved',auth.uid(),jsonb_build_object('name',p->>'name','mime','application/pdf','size',(p->>'size')::bigint,'sha256',p->>'sha256','kind',p->>'kind','content',p->>'content','uploadedBy',r));return jsonb_build_object('id',i,'path',path);end $$;

create or replace function public.kalling_execution_file_finish(p_file uuid) returns void language plpgsql security definer set search_path='' as $$
 declare f kalling_private.execution_files;t kalling_private.execution_transactions;items jsonb;begin
 select * into f from kalling_private.execution_files where id=p_file for update;select * into t from kalling_private.execution_transactions where id=f.transaction_id for update;
 if f.id is null or f.uploaded_by<>auth.uid() or kalling_private.execution_role(t.id) is null or kalling_private.execution_role(t.id)='viewer' or t.state='Abandoned' or (t.state='Closed' and (kalling_private.execution_role(t.id)<>'advisor' or f.data->>'kind' is distinct from 'Closing evidence')) then raise exception 'Upload completion denied' using errcode='42501';end if;
 if not exists(select 1 from storage.objects o where o.bucket_id='kalling-execution' and o.name=f.object_path and (o.metadata->>'size')::bigint=(f.data->>'size')::bigint and o.metadata->>'mimetype'='application/pdf') then raise exception 'The stored PDF does not match its reserved metadata.';end if;
 if f.status='Stored' then return;end if;update kalling_private.execution_files set status='Stored' where id=f.id;
 if t.state='Closed' then perform kalling_private.execution_save(t,t.data,'Post-close evidence stored','The completed acquisition stays closed.');return;end if;
 select coalesce(jsonb_agg(case when exists(select 1 from jsonb_array_elements(i->'sources') s join kalling_private.execution_files old on old.id=(s->>'fileId')::uuid where old.transaction_id=t.id and old.family=f.family and old.id<>f.id) then (i-'review')||jsonb_build_object('status','Changes needed','revision',(i->>'revision')::integer+1,'nextAction','Review the replacement document and submit a new response.') else i end),'[]') into items from jsonb_array_elements(t.data->'items') i;
 perform kalling_private.execution_save(t,jsonb_set(t.data-'closePackage','{items}',items)||case when exists(select 1 from jsonb_array_elements(t.data->'lois') lv join kalling_private.execution_files lf on lf.id=(lv->>'fileId')::uuid where lf.family=f.family) then jsonb_build_object('state','Planning') else '{}'::jsonb end,'Document stored','Upload does not resolve a request.');end $$;

create or replace function kalling_private.execution_file_allowed(p_file uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
 declare f kalling_private.execution_files;t kalling_private.execution_transactions;r text;h jsonb;begin
 select * into f from kalling_private.execution_files where id=p_file;if not found or f.status<>'Stored' then return false;end if;
 select * into t from kalling_private.execution_transactions where id=f.transaction_id;r=kalling_private.execution_role(t.id);if r is null then return false;end if;if r in ('advisor','viewer') then return true;end if;
 if not kalling_private.execution_current(f.id) then return false;end if;
 if t.state<>'Closed' and f.uploaded_by=auth.uid() then return true;end if;
 if f.review is null or not (r=any(f.grants)) or (f.data->>'content'='Restricted lender' and r='seller') then return false;end if;
 if f.data->>'content'='Named counterparties' and (t.data#>'{identity,seller}' is null or t.data#>'{identity,buyer}' is null or (r not in ('buyer','seller') and not exists(select 1 from kalling_private.execution_participants p where p.id::text=r and p.identity_allowed))) then return false;end if;
 if t.state='Closed' then h=t.data->'closes'->-1->'handover';return case when r='buyer' then h->'buyerFiles' ? f.id::text when r='seller' then h->'sellerFiles' ? f.id::text else h->'guestIds' ? r end;end if;
 return true;end $$;

create or replace function public.kalling_execution_file_grant(p_file uuid,p_recipients text[],p_permission jsonb,p_note text) returns void language plpgsql security definer set search_path='' as $$
 declare f kalling_private.execution_files;t kalling_private.execution_transactions;r text;begin select * into f from kalling_private.execution_files where id=p_file for update;select * into t from kalling_private.execution_transactions where id=f.transaction_id for update;
 if kalling_private.execution_role(t.id) is distinct from 'advisor' or t.state in ('Closed','Abandoned') or not kalling_private.execution_current(f.id) or f.review is null or not kalling_private.execution_source(t.id,p_permission) or not kalling_private.execution_safe(p_note,20,1000) then raise exception 'Review this document and record permission for the exact version.';end if;
 foreach r in array p_recipients loop
 if r not in ('seller','buyer') and not exists(select 1 from kalling_private.execution_participants p where p.transaction_id=t.id and p.id::text=r and p.status='Active' and p.expires_at>now()) then raise exception 'Choose current transaction participants.';end if;
 if f.data->>'content'='Restricted lender' and r='seller' then raise exception 'Restricted lender material is not shared with the seller.';end if;
 if f.data->>'content'='Named counterparties' and (t.data#>'{identity,seller}' is null or t.data#>'{identity,buyer}' is null or (r not in ('seller','buyer') and not exists(select 1 from kalling_private.execution_participants p where p.id::text=r and p.identity_allowed))) then raise exception 'Confirm both identity permissions before sharing a named document.';end if;end loop;
 update kalling_private.execution_files set grants=p_recipients,permission_revision=permission_revision+1 where id=f.id;perform kalling_private.execution_save(t,t.data-'closePackage','Document permission recorded',p_note);end $$;

create or replace function public.kalling_execution_file_open(p_file uuid) returns jsonb language plpgsql security definer set search_path='' as $$
 declare f kalling_private.execution_files;ticket uuid=gen_random_uuid();allowed boolean;begin
 select * into f from kalling_private.execution_files where id=p_file;allowed=kalling_private.execution_file_allowed(p_file);
 if f.id is not null then insert into kalling_private.execution_events(transaction_id,file_id,actor,event,ticket,object_path,grant_revision) values(f.transaction_id,f.id,auth.uid(),case when allowed then 'opened' else 'denied' end,case when allowed then ticket end,f.object_path,f.permission_revision);end if;
 if not allowed then return jsonb_build_object('allowed',false);end if;
 return jsonb_build_object('allowed',true,'ticket',ticket,'path',f.object_path,'bucket',case when f.portal_file_id is null then 'kalling-execution' else 'kalling-portal' end);end $$;

create or replace function kalling_private.execution_ticket_ok(p_path text) returns boolean language plpgsql volatile security definer set search_path='' as $$
 declare f kalling_private.execution_files;ok boolean=false;begin
 if auth.uid() is null then return false;end if;
 select x.* into f from kalling_private.execution_files x join kalling_private.execution_events e on e.file_id=x.id and e.object_path=x.object_path where e.actor=auth.uid() and e.event='opened' and e.ticket is not null and e.at>now()-interval '2 minutes' and e.at<=now() and e.object_path=p_path order by e.at desc limit 1;
 if f.id is null then return false;end if;
 ok=kalling_private.execution_file_allowed(f.id) and exists(select 1 from kalling_private.execution_events e where e.file_id=f.id and e.actor=auth.uid() and e.event='opened' and e.ticket is not null and e.grant_revision=f.permission_revision and e.at>now()-interval '2 minutes' and e.at<=now());
 if not ok and storage.allow_only_operation('object.get_authenticated') and not exists(select 1 from kalling_private.execution_events e where e.file_id=f.id and e.actor=auth.uid() and e.event='denied' and e.at>now()-interval '1 minute') then insert into kalling_private.execution_events(transaction_id,file_id,actor,event,note) values(f.transaction_id,f.id,auth.uid(),'denied','Current document or transaction authorization no longer permits this read.');end if;return ok;end $$;

create function public.kalling_execution_followup(p_transaction uuid,p_revision integer,p_action text,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
 declare t kalling_private.execution_transactions;i jsonb;n jsonb;items jsonb;begin
 select * into t from kalling_private.execution_transactions where id=p_transaction for update;
 if kalling_private.execution_role(t.id) is distinct from 'advisor' or t.state<>'Closed' or p_action<>'followup' then raise exception 'Post-close coordination access denied' using errcode='42501';end if;if t.revision<>p_revision then raise exception 'This transaction changed. Reload before saving.';end if;
 select z into i from jsonb_array_elements(t.data->'items') z where z->>'id'=p->>'id' and z->>'origin'='post-close';
 if (p->>'id' is not null and i is null) or not kalling_private.execution_safe(p->>'title',3,160) or not kalling_private.execution_safe(p->>'owner',2,120) or not kalling_private.execution_safe(p->>'nextAction',5,1000) or not kalling_private.execution_safe(p->>'note',20,2000) or not coalesce(kalling_private.execution_deadline(p->'due'),false) or coalesce(p->>'status','') not in ('Open','Waiting','Resolved') or jsonb_typeof(p->'audience') is distinct from 'array' or exists(select 1 from jsonb_array_elements_text(p->'audience') x where x not in ('buyer','seller')) or jsonb_typeof(p->'sources') is distinct from 'array' then raise exception 'Record an accountable person, actual obligation, deadline or reason and next action.';end if;
 if p->>'status'='Resolved' and not kalling_private.execution_sources(t.id,p->'sources') then raise exception 'A completed follow-up needs actual supporting evidence.';end if;
 n=jsonb_build_object('id',coalesce(i->>'id',gen_random_uuid()::text),'title',p->>'title','category','After closing','why',p->>'note','owner',p->>'owner','requestor',kalling_private.actor_name(),'reviewer',kalling_private.actor_name(),'nextAction',p->>'nextAction','due',p->'due','audience',p->'audience','contributors','[]'::jsonb,'priority','Normal','blocking',false,'authority','Contract','status',p->>'status','revision',coalesce((i->>'revision')::integer,0)+1,'dependsOn','[]'::jsonb,'sources',p->'sources','origin','post-close','thread',coalesce(i->'thread','[]'),'history',coalesce(i->'history','[]'));
 if p->>'status'='Resolved' then n=n||jsonb_build_object('review',jsonb_build_object('revision',n->'revision','by',kalling_private.actor_name(),'at',now(),'note',p->>'note','decision','Resolved'));end if;
 select coalesce(jsonb_agg(case when z->>'id'=n->>'id' then n else z end),'[]') into items from jsonb_array_elements(t.data->'items') z;if i is null then items=items||jsonb_build_array(n);end if;
 perform kalling_private.execution_save(t,jsonb_set(t.data,'{items}',items),'Post-close obligation recorded',p->>'title');return kalling_private.execution_projection(t.id);end $$;

create function kalling_private.execution_marketing_guard() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if new.status='Live' and old.status in ('Under LOI','Withdrawn') and exists(select 1 from kalling_private.execution_transactions t where t.listing_id=new.id and t.state='Abandoned') and not exists(select 1 from kalling_private.execution_transactions t join public.kalling_portals p on p.id=t.portal_id join public.kalling_portal_letters l on l.portal_id=p.id and l.status='Countersigned' where t.listing_id=new.id and p.status='Active') then raise exception 'Confirm the current engagement before reopening marketing.';end if;return new;end $$;
 create trigger execution_marketing_guard before update of status on public.kalling_listings for each row execute function kalling_private.execution_marketing_guard();
 revoke all on function public.kalling_execution_followup(uuid,integer,text,jsonb) from public,anon;grant execute on function public.kalling_execution_followup(uuid,integer,text,jsonb) to authenticated;
 revoke all on function kalling_private.execution_marketing_guard() from public,anon,authenticated;
 create function kalling_private.execution_source_amount(p_cents numeric,p_sources jsonb) returns boolean language plpgsql immutable set search_path='' as $$
 declare src jsonb;v text[];num numeric;begin
 if p_cents=0 then return true;end if;
 for src in select * from jsonb_array_elements(p_sources) loop
 for v in select regexp_matches(src->>'excerpt','(^|[^[:alnum:].,])([-+]?[$]?[[:space:]]*[0-9]+(?:,[0-9]{3})*(?:[.][0-9]{1,2})?)([^[:alnum:].,]|[.](?![0-9])|$)','g') loop
 if v[1]='(' and v[3]=')' then continue;end if;
 begin num=regexp_replace(v[2],'[$,[:space:]]','','g')::numeric;if num*100=p_cents then return true;end if;exception when invalid_text_representation then null;end;
 end loop;end loop;return false;exception when others then return false;end $$;
 revoke all on function kalling_private.execution_source_amount(numeric,jsonb) from public,anon,authenticated;
create or replace function public.kalling_execution_close(p_transaction uuid,p_revision integer,p_action text,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
 declare t kalling_private.execution_transactions;d jsonb;r text;b text[];c jsonb;h jsonb;key text;f text;latest jsonb;begin
 select * into t from kalling_private.execution_transactions where id=p_transaction for update;r=kalling_private.execution_role(t.id);
 if r is distinct from 'advisor' then raise exception 'Closing review access denied' using errcode='42501';end if;
 if p_action in ('close','correct_close') and coalesce(kalling_private.role_for(t.firm_id),'') not in ('owner','admin') then raise exception 'Only a firm owner or administrator can record completion.' using errcode='42501';end if;
 if p_action='close' and t.state='Closed' then
 if t.data->'closes'->0->>'id'=p->>'commandId' then
 if t.data->'closes'->0->>'date' is distinct from p->>'date' or t.data->'closes'->0->>'note' is distinct from p->>'note' or t.data->'closes'->0->'amounts' is distinct from p->'amounts' or t.data->'closes'->0->'evidence' is distinct from p->'evidence' or t.data->'closes'->0->'handover' is distinct from p->'handover' then raise exception 'This close command already completed with different details. Use a versioned correction.';end if;return kalling_private.execution_projection(t.id);
 else raise exception 'This acquisition is already closed. Use a versioned correction.';end if;end if;
 if t.revision<>p_revision then raise exception 'This transaction changed. Reload before saving.';end if;d=t.data;
 if p_action='prepare_close' then
 if t.state not in ('Planning','LOI reviewed') then raise exception 'This transaction is an archive.';end if;b=kalling_private.execution_blockers(t);if cardinality(b)>0 then raise exception 'Resolve closing blockers: %',array_to_string(b,'; ');end if;
 if not kalling_private.execution_safe(p->>'note',30,2000) then raise exception 'Explain the current completion package.';end if;
 d=d||jsonb_build_object('closePackage',jsonb_build_object('revision',t.revision+1,'loiVersion',d->'lois'->-1->'version','by',kalling_private.actor_name(),'at',now(),'note',p->>'note'));perform kalling_private.execution_save(t,d,'Completion package prepared',p->>'note');return kalling_private.execution_projection(t.id);end if;
 if p_action not in ('close','correct_close') then raise exception 'Unknown completion action';end if;
 if not kalling_private.execution_amounts(p->'amounts') or not kalling_private.execution_sources(t.id,p->'evidence') or not kalling_private.execution_safe(p->>'note',30,2000) or not coalesce(to_char((p->>'date')::date,'YYYY-MM-DD')=p->>'date' and (p->>'date')::date<=current_date,false) then raise exception 'Record actual completion evidence, date, reconciled integer US cents and consideration basis.';end if;
 for key in select unnest(array['cash','sellerNote','otherFixed','earnoutMax','earnoutRealized']) loop if not kalling_private.execution_source_amount((p->'amounts'->>key)::numeric,p->'evidence') then raise exception 'Cite the actual source amount for %.',key;end if;end loop;
 -- Lock every evidence file before final checks so concurrent replacement cannot invalidate a close mid-command.
 perform 1 from kalling_private.execution_files where transaction_id=t.id for update;
 latest=d->'closes'->-1;
 if p_action='correct_close' then
 if t.state<>'Closed' or latest is null then raise exception 'Only a completed acquisition has a closing correction.';end if;
 c=(latest-'correctionReason')||jsonb_build_object('version',(latest->>'version')::integer+1,'date',p->>'date','amounts',p->'amounts','evidence',p->'evidence','note',p->>'note','by',kalling_private.actor_name(),'at',now(),'correctionReason',p->>'note');
 select coalesce(jsonb_agg(case when x->>'status' in ('Approved','Published') then (x-'delivery')||jsonb_build_object('status','Withdrawn') else x end),'[]') into h from jsonb_array_elements(d->'cases') x;d=jsonb_set(d,'{cases}',h);
 else
 if t.state not in ('Planning','LOI reviewed') or (d#>>'{closePackage,revision}')::integer is distinct from t.revision or d#>>'{closePackage,loiVersion}' is distinct from d->'lois'->-1->>'version' then raise exception 'Prepare a current completion package.';end if;
 b=kalling_private.execution_blockers(t);if cardinality(b)>0 then raise exception 'Closing conditions or evidence changed: %',array_to_string(b,'; ');end if;
 if p->>'commandId' is null or jsonb_typeof(p->'handover') is distinct from 'object' or jsonb_typeof(p#>'{handover,buyerFiles}') is distinct from 'array' or jsonb_typeof(p#>'{handover,sellerFiles}') is distinct from 'array' or jsonb_typeof(p#>'{handover,guestIds}') is distinct from 'array' then raise exception 'Review post-close access explicitly, including empty grants.';end if;
 foreach key in array array['buyer','seller'] loop for f in select * from jsonb_array_elements_text(p->'handover'->(key||'Files')) loop if not exists(select 1 from kalling_private.execution_files x where x.transaction_id=t.id and x.id::text=f and x.review is not null and key=any(x.grants) and kalling_private.execution_current(x.id)) then raise exception 'Handover contains an unapproved or stale document.';end if;end loop;end loop;
 for f in select * from jsonb_array_elements_text(p#>'{handover,guestIds}') loop if not exists(select 1 from kalling_private.execution_participants g where g.transaction_id=t.id and g.id::text=f and g.status='Active' and g.expires_at>now()) then raise exception 'Review the current handover participants.';end if;end loop;
 c=jsonb_build_object('id',(p->>'commandId')::uuid,'version',1,'date',p->>'date','amounts',p->'amounts','evidence',p->'evidence','note',p->>'note','by',kalling_private.actor_name(),'at',now(),'packageRevision',t.revision,'loiVersion',d->'lois'->-1->'version','handover',p->'handover');
 end if;
 d=(d-'closePackage')||jsonb_build_object('state','Closed','closes',d->'closes'||jsonb_build_array(c));
 if p_action='close' then d=jsonb_set(d,'{cases}',jsonb_build_array(jsonb_build_object('version',1,'title','A completed HVAC acquisition','body','The parties completed an HVAC acquisition. Kalling will prepare a short account of the process only if the seller chooses to take part.','fields',jsonb_build_array('Text only'),'channels',jsonb_build_array('Website'),'rights','Private preparation only. Publication and any third-party permissions require separate review.','status','Draft','createdAt',now(),'createdBy',kalling_private.actor_name())));end if;
 perform kalling_private.execution_save(t,d,case when p_action='close' then 'Acquisition closed' else 'Closing record corrected' end,p->>'note');
 if p_action='close' then
 update public.kalling_listings set status='Sold',updated_at=now() where id=t.listing_id;
 update public.kalling_access set status='Declined',decision_note='The acquisition has closed.' where listing_id=t.listing_id and buyer_id<>t.buyer_id and status in ('Approved','Pending');
 update kalling_private.execution_participants set status='Revoked' where transaction_id=t.id and not (p#>'{handover,guestIds}' ? id::text);
 update kalling_private.alert_outbox set status='Suppressed',lease=null,lease_until=null,notice='This listing has sold.' where status in ('Awaiting review','Approved','Sending','Failed') and exists(select 1 from jsonb_array_elements(payload->'items') x where x->>'id'=t.listing_id::text);
 end if;return kalling_private.execution_projection(t.id);end $$;
create or replace function public.kalling_execution_comparable(p_transaction uuid,p_revision integer,p_action text,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
 declare t kalling_private.execution_transactions;r text;d jsonb;c jsonb;n jsonb;begin
 select * into t from kalling_private.execution_transactions where id=p_transaction for update;r=kalling_private.execution_role(t.id);
 if r is distinct from 'advisor' or coalesce(kalling_private.role_for(t.firm_id),'') not in ('owner','admin') or t.state<>'Closed' or jsonb_array_length(t.data->'closes')=0 then raise exception 'A firm owner or administrator must review a documented completed acquisition.' using errcode='42501';end if;if t.revision<>p_revision then raise exception 'This transaction changed. Reload before saving.';end if;d=t.data;c=d->'comparables'->-1;
 if p_action='comp_withdraw' then
 if c is null or not kalling_private.execution_safe(p->>'note',20,2000) then raise exception 'Record why the authority or evidence is withdrawn.';end if;n=c||jsonb_build_object('disputed',true,'version',(c->>'version')::integer+1,'note',p->>'note','reviewer',kalling_private.actor_name(),'at',now());
 elsif p_action='comp_review' then
 if coalesce(p->>'state','') not in ('NJ','NY') or coalesce(p->>'basis','') not in ('Cash','Accrual') or coalesce(p->>'metric','') not in ('SDE','EBITDA') or not kalling_private.execution_safe(p->>'businessType',3,100) or not kalling_private.execution_safe(p->>'note',20,2000) or p->>'period'!~'^\d{4}-\d{2}-\d{2} to \d{4}-\d{2}-\d{2}$' or not coalesce(to_char(split_part(p->>'period',' to ',1)::date,'YYYY-MM-DD')=split_part(p->>'period',' to ',1) and to_char(split_part(p->>'period',' to ',2)::date,'YYYY-MM-DD')=split_part(p->>'period',' to ',2) and split_part(p->>'period',' to ',1)::date<=split_part(p->>'period',' to ',2)::date,false) then raise exception 'Record the deidentified transaction type, exact financial period, metric and accounting basis.';end if;
 if jsonb_typeof(p->'earnings') is distinct from 'number' or p->>'earnings'!~'^[0-9]+$' or (p->>'earnings')::numeric<=0 or (p->>'earnings')::numeric>100000000000000 or jsonb_typeof(p->'revenue') is distinct from 'number' or p->>'revenue'!~'^[0-9]+$' or (p->>'revenue')::numeric<=0 or (p->>'revenue')::numeric>100000000000000 or coalesce((p->>'recastVersion')::integer,0)<=0 or not kalling_private.execution_sources(t.id,p->'sources') or not kalling_private.execution_safe(p#>>'{authority,note}',30,2000) or not kalling_private.execution_safe(p#>>'{authority,professional}',3,160) or coalesce(p#>>'{authority,scope}','')<>'Internal deidentified analysis' or jsonb_typeof(p->'disputed') is distinct from 'boolean' then raise exception 'Review exact reconciled US cents, source versions and separate internal data-use authority.';end if;
 if not kalling_private.execution_source_amount((p->>'earnings')::numeric,p->'sources') or not kalling_private.execution_source_amount((p->>'revenue')::numeric,p->'sources') then raise exception 'Cite exact passages containing the approved earnings and revenue amounts.';end if;
 n=jsonb_build_object('version',coalesce((c->>'version')::integer,0)+1,'closeVersion',d->'closes'->-1->'version','state',p->>'state','businessType',p->>'businessType','period',p->>'period','basis',p->>'basis','metric',p->>'metric','earnings',p->'earnings','revenue',p->'revenue','recastVersion',p->'recastVersion','sources',p->'sources','authority',jsonb_build_object('note',p#>>'{authority,note}','professional',p#>>'{authority,professional}','scope','Internal deidentified analysis','at',now()),'reviewer',kalling_private.actor_name(),'at',now(),'disputed',p->'disputed','note',p->>'note');
 else raise exception 'Unknown comparable action';end if;
 perform kalling_private.execution_save(t,jsonb_set(d,'{comparables}',d->'comparables'||jsonb_build_array(n)),p_action,'Original valuation and closing history retained.');return kalling_private.execution_projection(t.id);end $$;
create or replace function kalling_private.execution_projection(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
 declare t kalling_private.execution_transactions;r text;d jsonb;items jsonb;files jsonb;begin
 select * into t from kalling_private.execution_transactions where id=p_id;r=kalling_private.execution_role(p_id);if r is null then raise exception 'Transaction access denied' using errcode='42501';end if;d=t.data;
 select coalesce(jsonb_agg(i||jsonb_build_object('current',kalling_private.execution_item_ok(t,i))),'[]') into items from jsonb_array_elements(d->'items') i;d=jsonb_set(d,'{items}',items);
 select coalesce(jsonb_agg(c||jsonb_build_object('current',kalling_private.execution_condition_ok(t,c))),'[]') into items from jsonb_array_elements(d->'conditions') c;d=jsonb_set(d,'{conditions}',items);
 if r in ('advisor','viewer') then
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'email',p.email,'name',p.name,'role',p.role,'purpose',p.purpose,'coordinator',p.coordinator,'status',p.status,'expiresAt',p.expires_at,'acceptedAt',p.accepted_at,'identityAllowed',p.identity_allowed)),'[]') into items from kalling_private.execution_participants p where transaction_id=t.id;d=d||jsonb_build_object('participants',items);
 else
 d=d-'buyerId'-'firmId'-'companyId'-'originalEstimate'-'stopReason'||jsonb_build_object('buyerId','','firmId','','companyId','','originalEstimate',null,'identity','{}'::jsonb,'participants','[]'::jsonb,'history','[]'::jsonb,'comparables','[]'::jsonb);
 select coalesce(jsonb_agg(l),'[]') into items from jsonb_array_elements(t.data->'lois') l where kalling_private.execution_file_allowed((l->>'fileId')::uuid);d=jsonb_set(d,'{lois}',items);
 select coalesce(jsonb_agg(o),'[]') into items from jsonb_array_elements(t.data->'obligations') o where kalling_private.execution_file_allowed((o#>>'{source,fileId}')::uuid);d=jsonb_set(d,'{obligations}',items);
 select coalesce(jsonb_agg((i-'history')||jsonb_build_object('history','[]'::jsonb,'sources',(select coalesce(jsonb_agg(s),'[]') from jsonb_array_elements(i->'sources') s where kalling_private.execution_file_allowed((s->>'fileId')::uuid)))),'[]') into items from jsonb_array_elements(d->'items') i where i->'audience' ? r;d=jsonb_set(d,'{items}',items);
 select coalesce(jsonb_agg((i-'history')||jsonb_build_object('history','[]'::jsonb,'sources',(select coalesce(jsonb_agg(s),'[]') from jsonb_array_elements(i->'sources') s where kalling_private.execution_file_allowed((s->>'fileId')::uuid)))),'[]') into items from jsonb_array_elements(d->'conditions') i where i->'audience' ? r;d=jsonb_set(d,'{conditions}',items);
 if r<>'seller' then d=jsonb_set(d,'{cases}','[]');end if;
 if r not in ('buyer','seller') then d=d-'terms'-'offerId'-'offerVersion'-'planningClose';end if;
 select coalesce(jsonb_agg((c-'evidence'-'handover')||jsonb_build_object('evidence',coalesce((select jsonb_agg(s) from jsonb_array_elements(c->'evidence') s where kalling_private.execution_file_allowed((s->>'fileId')::uuid)),'[]'),'handover',jsonb_build_object('guestIds','[]'::jsonb,'buyerFiles','[]'::jsonb,'sellerFiles','[]'::jsonb))),'[]') into items from jsonb_array_elements(t.data->'closes') c;d=jsonb_set(d,'{closes}',case when r in ('buyer','seller') then items else '[]'::jsonb end);
 if d->'closePackage' is not null then d=jsonb_set(d,'{closePackage,note}','"Prepared for a completion review."');end if;
 end if;
 select coalesce(jsonb_agg(f.data||jsonb_build_object('id',f.id,'transactionId',f.transaction_id,'family',f.family,'version',f.version,'status',f.status,'createdAt',f.created_at,'review',f.review,'grants',case when r in ('advisor','viewer') then to_jsonb(f.grants) else '[]'::jsonb end)),'[]') into files from kalling_private.execution_files f where f.transaction_id=t.id and (r in ('advisor','viewer') or kalling_private.execution_file_allowed(f.id));
 return jsonb_build_object('transaction',d,'files',files,'role',r,'canClose',r='advisor' and kalling_private.role_for(t.firm_id) in ('owner','admin'));end $$;
create or replace function public.kalling_dataroom_grant_loi(p_listing uuid,p_buyer uuid,p_note text) returns void language plpgsql security definer set search_path='' as $$ begin perform kalling_private.need_advisor();raise exception 'Use the execution transaction and reviewed external LOI signatures.';end $$;
create or replace function kalling_private.execution_source(p_tx uuid,p jsonb) returns boolean language plpgsql stable security definer set search_path='' as $$ begin
 return coalesce(jsonb_typeof(p)='object' and (p->>'page')::integer between 1 and 5000 and kalling_private.execution_safe(p->>'excerpt',5,5000) and exists(select 1 from kalling_private.execution_files f where f.id=(p->>'fileId')::uuid and f.transaction_id=p_tx and kalling_private.execution_current(f.id)),false);
 exception when others then return false;end $$;
create or replace function kalling_private.has_access(p_listing uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.kalling_access a join public.kalling_buyers b on b.id=a.buyer_id join public.kalling_listings l on l.id=a.listing_id where a.listing_id=p_listing and a.status='Approved' and b.user_id=auth.uid() and b.status<>'Restricted' and l.status in ('Live','Under LOI'))
$$;
commit;
