-- Completion is an atomic, idempotent transaction. Generic stage controls cannot mark Sold.
begin;
create function kalling_private.execution_blockers(t kalling_private.execution_transactions) returns text[] language plpgsql stable security definer set search_path='' as $$
 declare out text[]='{}';i jsonb;k text;begin
 if not exists(select 1 from public.kalling_offers o join public.kalling_buyers b on b.id=o.buyer_id join public.kalling_listings l on l.id=o.listing_id where o.id=t.offer_id and o.current_version=t.offer_version and o.status not in ('Withdrawn','Declined') and b.status<>'Restricted' and l.status in ('Live','Under LOI') and exists(select 1 from public.kalling_access a where a.listing_id=t.listing_id and a.buyer_id=t.buyer_id and a.status='Approved')) then out=array_append(out,'The selected offer, buyer approval or listing is no longer current.');end if;
 if not kalling_private.execution_loi_ok(t) then out=array_append(out,'Review the current externally signed LOI.');end if;
 if jsonb_array_length(t.data->'obligations')=0 then out=array_append(out,'Confirm the obligations in the current LOI.');end if;
 for i in select z from jsonb_array_elements(t.data->'obligations') z where not exists(select 1 from jsonb_array_elements(t.data->'obligations') n where n->>'supersedes'=z->>'id') loop
 if i->>'loiVersion' is distinct from t.data->'lois'->-1->>'version' or not kalling_private.execution_source(t.id,i->'source') or i#>>'{deadline,kind}'='Unknown' then out=array_append(out,'Confirm the current obligation: '||(i->>'title'));end if;end loop;
 if not exists(select 1 from jsonb_array_elements(t.data->'items') z where z->>'category'='Financial') then out=array_append(out,'Create and review financial diligence.');end if;
 for i in select * from jsonb_array_elements(t.data->'items') loop if coalesce((i->>'blocking')::boolean,false) and not kalling_private.execution_item_ok(t,i) then out=array_append(out,i->>'title');end if;end loop;
 foreach k in array array['Financing','Escrow','License','Premises','Purchase agreement'] loop if not exists(select 1 from jsonb_array_elements(t.data->'conditions') z where z->>'kind'=k) then out=array_append(out,'Record the '||lower(k)||' condition.');end if;end loop;
 for i in select * from jsonb_array_elements(t.data->'conditions') loop if (coalesce((i->>'required')::boolean,false) or i->>'kind' in ('Financing','Escrow','License','Premises','Purchase agreement')) and not kalling_private.execution_condition_ok(t,i) then out=array_append(out,i->>'title');end if;end loop;
 return out;end $$;
create function kalling_private.execution_amounts(p jsonb) returns boolean language plpgsql immutable set search_path='' as $$
 declare key text;value numeric;begin
 if coalesce(p->>'currency','')<>'USD' or coalesce(p->>'basis','') not in ('Asset consideration','Equity consideration') or not kalling_private.execution_safe(p->>'basisNote',30,2000) then return false;end if;
 foreach key in array array['cash','sellerNote','otherFixed','fixed','earnoutMax','earnoutRealized','workingCapital','inventory','realEstate','buyerDebt'] loop
 if jsonb_typeof(p->key) is distinct from 'number' or p->>key!~'^[0-9]+$' then return false;end if;value=(p->>key)::numeric;if value<0 or value>100000000000000 then return false;end if;end loop;
 return (p->>'fixed')::numeric>0 and (p->>'fixed')::numeric=(p->>'cash')::numeric+(p->>'sellerNote')::numeric+(p->>'otherFixed')::numeric and (p->>'earnoutRealized')::numeric<=(p->>'earnoutMax')::numeric;exception when others then return false;end $$;
create function public.kalling_execution_readiness(p_transaction uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
 declare t kalling_private.execution_transactions;begin select * into t from kalling_private.execution_transactions where id=p_transaction;if kalling_private.execution_role(t.id) not in ('advisor','viewer') or kalling_private.execution_role(t.id) is null then raise exception 'Review access denied' using errcode='42501';end if;return jsonb_build_object('blockers',to_jsonb(kalling_private.execution_blockers(t)),'revision',t.revision,'state',t.state);end $$;
create function public.kalling_execution_close(p_transaction uuid,p_revision integer,p_action text,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
 declare t kalling_private.execution_transactions;d jsonb;r text;b text[];c jsonb;h jsonb;key text;f text;latest jsonb;begin
 select * into t from kalling_private.execution_transactions where id=p_transaction for update;r=kalling_private.execution_role(t.id);
 if r is distinct from 'advisor' then raise exception 'Closing review access denied' using errcode='42501';end if;
 if p_action in ('close','correct_close') and coalesce(kalling_private.role_for(t.firm_id),'') not in ('owner','admin') then raise exception 'Only a firm owner or administrator can record completion.' using errcode='42501';end if;
 if p_action='close' and t.state='Closed' then if t.data->'closes'->0->>'id'=p->>'commandId' then return kalling_private.execution_projection(t.id);else raise exception 'This acquisition is already closed. Use a versioned correction.';end if;end if;
 if t.revision<>p_revision then raise exception 'This transaction changed. Reload before saving.';end if;d=t.data;
 if p_action='prepare_close' then
 if t.state not in ('Planning','LOI reviewed') then raise exception 'This transaction is an archive.';end if;b=kalling_private.execution_blockers(t);if cardinality(b)>0 then raise exception 'Resolve closing blockers: %',array_to_string(b,'; ');end if;
 if not kalling_private.execution_safe(p->>'note',30,2000) then raise exception 'Explain the current completion package.';end if;
 d=d||jsonb_build_object('closePackage',jsonb_build_object('revision',t.revision+1,'loiVersion',d->'lois'->-1->'version','by',kalling_private.actor_name(),'at',now(),'note',p->>'note'));perform kalling_private.execution_save(t,d,'Completion package prepared',p->>'note');return kalling_private.execution_projection(t.id);end if;
 if p_action not in ('close','correct_close') then raise exception 'Unknown completion action';end if;
 if not kalling_private.execution_amounts(p->'amounts') or not kalling_private.execution_sources(t.id,p->'evidence') or not kalling_private.execution_safe(p->>'note',30,2000) or not coalesce(to_char((p->>'date')::date,'YYYY-MM-DD')=p->>'date' and (p->>'date')::date<=current_date,false) then raise exception 'Record actual completion evidence, date, reconciled integer US cents and consideration basis.';end if;
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
create function kalling_private.execution_sold_guard() returns trigger language plpgsql security definer set search_path='' as $$
 begin if old.status='Sold' and new.status<>'Sold' then raise exception 'A completed acquisition is an archive. Record a correction instead.';end if;
 if new.status='Sold' and old.status<>'Sold' and not exists(select 1 from kalling_private.execution_transactions t where t.listing_id=new.id and t.state='Closed' and jsonb_array_length(t.data->'closes')>0) then raise exception 'Use the reviewed completion record to mark this listing sold.';end if;return new;end $$;
create trigger execution_sold_guard before update of status on public.kalling_listings for each row execute function kalling_private.execution_sold_guard();
-- Acceptance records an owner instruction. It never manufactures signed-LOI evidence.
create or replace function public.kalling_offer_accept(p_offer uuid,p_version int,p_instruction text) returns void language plpgsql security definer set search_path='' as $$declare o public.kalling_offers;begin
 perform kalling_private.need_advisor();select * into o from public.kalling_offers where id=p_offer for update;
 if o.id is null or o.current_version<>p_version or o.status in ('Withdrawn','Declined') or not exists(select 1 from kalling_private.offer_shares where offer_id=o.id and version=p_version) or nullif(o.term_details->>'expiresOn','')::date<current_date or not exists(select 1 from public.kalling_access a join public.kalling_buyers b on b.id=a.buyer_id where a.listing_id=o.listing_id and a.buyer_id=o.buyer_id and a.status='Approved' and b.status<>'Restricted') then raise exception 'Share and review the current active version first.';end if;
 if length(trim(coalesce(p_instruction,'')))<10 then raise exception 'Record the owner instruction and how it was confirmed.';end if;
 insert into kalling_private.offer_instructions(offer_id,version,instruction,actor_id) values(o.id,p_version,left(p_instruction,2000),auth.uid());update public.kalling_offers set status='Accepted',updated_at=now() where id=o.id;
 end $$;
-- Current signed execution, rather than an offer status or a legacy grant, controls the after-LOI tier.
create or replace function kalling_private.dataroom_tier(p_listing uuid,p_buyer uuid) returns integer language sql stable security definer set search_path='' as $$
 select case
 when not exists(select 1 from public.kalling_buyers b where b.id=p_buyer and b.status<>'Restricted') then 0
 when not exists(select 1 from public.kalling_listings l where l.id=p_listing and l.status in ('Live','Under LOI')) then 0
 when not exists(select 1 from public.kalling_dataroom_rooms r where r.listing_id=p_listing and r.status='Published') then 0
 when not exists(select 1 from public.kalling_access a where a.listing_id=p_listing and a.buyer_id=p_buyer and a.status='Approved') then 0
 when exists(select 1 from kalling_private.execution_transactions t where t.listing_id=p_listing and t.buyer_id=p_buyer and t.state='LOI reviewed' and kalling_private.execution_loi_ok(t)) then 2 else 1 end
$$;
-- Reuse an accepted owner upload by reference. Bytes and the original owner request remain canonical.
alter table kalling_private.execution_files drop constraint execution_files_object_path_key;
create unique index execution_file_origin_once on kalling_private.execution_files(transaction_id,object_path);
create function public.kalling_execution_file_reuse(p_transaction uuid,p_file uuid,p_kind text,p_content text) returns uuid language plpgsql security definer set search_path='' as $$
 declare t kalling_private.execution_transactions;f public.kalling_portal_files;i uuid=gen_random_uuid();begin
 select * into t from kalling_private.execution_transactions where id=p_transaction for update;select * into f from public.kalling_portal_files where id=p_file;
 if kalling_private.execution_role(t.id) is distinct from 'advisor' or t.state not in ('Planning','LOI reviewed') or f.portal_id is distinct from t.portal_id or f.status<>'stored' or not exists(select 1 from public.kalling_portal_requests r where r.portal_id=t.portal_id and r.status='Accepted' and f.id=any(r.file_ids)) then raise exception 'Reuse an accepted current owner upload for this transaction.';end if;
 if p_kind not in ('LOI','Diligence','Closing evidence','Lease','License','Other') or p_content not in ('Confidential','Named counterparties','Restricted lender') then raise exception 'Choose the purpose and document confidentiality.';end if;
 select id into i from kalling_private.execution_files where transaction_id=t.id and portal_file_id=f.id;if i is not null then return i;end if;i=gen_random_uuid();
 insert into kalling_private.execution_files(id,transaction_id,family,version,object_path,portal_file_id,status,uploaded_by,data) values(i,t.id,gen_random_uuid(),1,f.object_path,f.id,'Stored',auth.uid(),jsonb_build_object('name',f.name,'mime',f.mime,'size',f.size,'sha256',f.sha256,'kind',p_kind,'content',p_content,'uploadedBy','advisor','portalFileId',f.id));
 perform kalling_private.execution_save(t,t.data-'closePackage','Owner document linked','Reused the accepted original; no file was automatically shared.');return i;end $$;
revoke all on function kalling_private.execution_blockers(kalling_private.execution_transactions),kalling_private.execution_amounts(jsonb),kalling_private.execution_sold_guard() from public,anon,authenticated;
revoke all on function public.kalling_execution_readiness(uuid),public.kalling_execution_close(uuid,integer,text,jsonb),public.kalling_execution_file_reuse(uuid,uuid,text,text) from public,anon;
grant execute on function public.kalling_execution_readiness(uuid),public.kalling_execution_close(uuid,integer,text,jsonb),public.kalling_execution_file_reuse(uuid,uuid,text,text) to authenticated;
commit;

