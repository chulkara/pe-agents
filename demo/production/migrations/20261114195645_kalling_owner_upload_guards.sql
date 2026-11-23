-- Enforce the engagement gate at file RPCs and Storage, preserve immutable retries,
-- and invalidate request acceptance when its exact attachment set changes.
begin;

create function kalling_private.portal_file_role(p uuid) returns text language sql stable security definer set search_path='' as $$
 select case when kalling_private.portal_role(p)='seller' and x.requests_hidden then null else kalling_private.portal_role(p) end
 from public.kalling_portals x where x.id=p
$$;
create function kalling_private.portal_files_need(p uuid,allowed text[]) returns text language plpgsql security definer set search_path='' as $$
declare r text=kalling_private.portal_need(p,allowed); begin
 if kalling_private.portal_file_role(p) is null then raise exception 'Documents open after the engagement letter is signed.' using errcode='42501'; end if;
 return r;
end $$;
revoke all on function kalling_private.portal_file_role(uuid),kalling_private.portal_files_need(uuid,text[]) from public,anon,authenticated;
grant execute on function kalling_private.portal_file_role(uuid) to authenticated;

alter policy portal_files_read on public.kalling_portal_files using(status='stored' and kalling_private.portal_file_role(portal_id) is not null);
create or replace function kalling_private.can_upload_portal(path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.kalling_portal_files f where f.object_path=path and f.uploaded_by=auth.uid() and f.status='reserved'
  and f.created_at>now()-interval '1 day' and kalling_private.portal_file_role(f.portal_id) in ('firm-write','seller')
  and (kalling_private.portal_file_role(f.portal_id)<>'seller' or not exists(select 1 from public.kalling_portal_requests r where r.id=f.request_id and r.status in ('Accepted','Not applicable'))))
$$;
create or replace function kalling_private.can_download_portal(path text) returns boolean language sql stable security definer set search_path='' as $$
 select storage.allow_only_operation('object.get_authenticated') and exists(select 1 from public.kalling_portal_files f
  where f.object_path=path and f.status='stored' and kalling_private.portal_file_role(f.portal_id) is not null)
$$;

create or replace function public.kalling_portal_link(p_request uuid,p_file uuid) returns void language plpgsql security definer set search_path='' as $$
declare r public.kalling_portal_requests; side text; begin
 select * into r from public.kalling_portal_requests where id=p_request;
 -- All file writes lock the portal first, then the request/file. Gate changes and
 -- simultaneous finalisations therefore cannot cross the authorization check.
 perform 1 from public.kalling_portals where id=r.portal_id for update;
 side=kalling_private.portal_files_need(r.portal_id,array['seller','firm-write']);
 select * into r from public.kalling_portal_requests where id=p_request for update;
 if not exists(select 1 from public.kalling_portal_files where id=p_file and portal_id=r.portal_id and status='stored') then raise exception 'That document is not available in this portal.'; end if;
 if p_file=any(r.file_ids) then return; end if;
 if side='seller' and r.status in ('Accepted','Not applicable') then raise exception 'This request is already complete.'; end if;
 update public.kalling_portal_requests set file_ids=file_ids||p_file,updated_at=now(),
  status='In progress',review_note=case when r.status in ('Accepted','Submitted') then '' else review_note end,
  submitted_at=null where id=r.id;
end $$;

create or replace function public.kalling_portal_reserve_file(p_request uuid,p_name text,p_mime text,p_size bigint,p_sha256 text) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.kalling_portal_requests; f public.kalling_portal_files; side text; begin
 select * into r from public.kalling_portal_requests where id=p_request;
 perform 1 from public.kalling_portals where id=r.portal_id for update;
 side=kalling_private.portal_files_need(r.portal_id,array['seller','firm-write']);
 select * into r from public.kalling_portal_requests where id=p_request;
 if side='seller' and r.status in ('Accepted','Not applicable') then raise exception 'This request is already complete.'; end if;
 if coalesce(p_sha256,'')!~'^[0-9a-f]{64}$' then raise exception 'File fingerprint missing'; end if;
 if p_size is null or p_size not between 1 and 10485760 then raise exception 'Each file can be up to 10 MB. Split larger files or contact your help contact.'; end if;
 if p_mime is null or p_name is null or p_mime not in ('application/pdf','image/png','image/jpeg','text/plain','text/csv','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/msword') or p_name!~*'[.](pdf|png|jpe?g|txt|csv|xlsx?|docx?)$' then raise exception 'Use PDF, image, Word, Excel, CSV or text files.'; end if;
 select * into f from public.kalling_portal_files where portal_id=r.portal_id and sha256=p_sha256 and status='stored';
 if f.id is not null then
  if f.size<>p_size or f.mime<>p_mime then raise exception 'The size and type must match the existing file fingerprint.'; end if;
  perform public.kalling_portal_link(p_request,f.id);
  return jsonb_build_object('file',to_jsonb(f)-'object_path'-'uploaded_by','duplicate',true);
 end if;
 select * into f from public.kalling_portal_files where portal_id=r.portal_id and sha256=p_sha256 and status='reserved' and uploaded_by=auth.uid() and created_at>now()-interval '1 day' order by created_at desc limit 1;
 if f.id is not null and (f.size<>p_size or f.mime<>p_mime) then raise exception 'The size and type must match the existing file fingerprint.'; end if;
 if f.id is null then
  if (select count(*) from public.kalling_portal_files where portal_id=r.portal_id)>=100 then raise exception 'This portal has reached its 100-file limit. Contact your help contact.'; end if;
  if (select coalesce(sum(size),0) from public.kalling_portal_files where portal_id=r.portal_id)+p_size>209715200 then raise exception 'This portal has reached its storage limit. Contact your help contact.'; end if;
  insert into public.kalling_portal_files(portal_id,request_id,name,mime,size,sha256,object_path,uploaded_by,uploader_name,side)
   values(r.portal_id,p_request,left(trim(p_name),200),p_mime,p_size,p_sha256,r.portal_id::text||'/'||gen_random_uuid()::text||'/'||gen_random_uuid()::text,auth.uid(),kalling_private.actor_name(),case when side='seller' then 'seller' else 'firm' end) returning * into f;
 end if;
 return jsonb_build_object('file',to_jsonb(f)-'uploaded_by','duplicate',false,'uploaded',exists(select 1 from storage.objects o where o.bucket_id='kalling-portal' and o.name=f.object_path));
end $$;

create or replace function public.kalling_portal_finish_file(p_file uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare f public.kalling_portal_files; bytes bigint; mime text; existing uuid; changed boolean=false; begin
 select * into f from public.kalling_portal_files where id=p_file;
 if f.id is null or f.uploaded_by<>auth.uid() then raise exception 'Upload unavailable' using errcode='42501'; end if;
 perform 1 from public.kalling_portals where id=f.portal_id for update;
 perform kalling_private.portal_files_need(f.portal_id,array['seller','firm-write']);
 select * into f from public.kalling_portal_files where id=p_file for update;
 if f.status='reserved' then
  select (metadata->>'size')::bigint,metadata->>'mimetype' into bytes,mime from storage.objects where bucket_id='kalling-portal' and name=f.object_path;
  if bytes is distinct from f.size or mime is distinct from f.mime then raise exception 'The uploaded file did not arrive completely. Try uploading it again.'; end if;
  select id into existing from public.kalling_portal_files where portal_id=f.portal_id and sha256=f.sha256 and status='stored';
  if existing is not null then f.id=existing;
  else update public.kalling_portal_files set status='stored' where id=f.id;changed=true; end if;
 end if;
 if f.request_id is not null then perform public.kalling_portal_link(f.request_id,f.id); end if;
 if changed then insert into public.kalling_audit(firm_id,actor_id,event,detail) select firm_id,auth.uid(),'portal.file_stored',jsonb_build_object('portal_id',id,'file_id',f.id) from public.kalling_portals where id=f.portal_id; end if;
 return (select to_jsonb(x)-'object_path'-'uploaded_by' from public.kalling_portal_files x where id=f.id);
end $$;
create or replace function public.kalling_portal_file_path(p_file uuid) returns text language plpgsql security definer set search_path='' as $$
declare f public.kalling_portal_files; begin
 select * into f from public.kalling_portal_files where id=p_file and status='stored';
 perform kalling_private.portal_files_need(f.portal_id,array['seller','firm-write','firm-read']);
 return f.object_path;
end $$;
create or replace function public.kalling_portal_reserve_firm_file(p_portal uuid,p_name text,p_mime text,p_size bigint,p_sha256 text) returns jsonb language plpgsql security definer set search_path='' as $$
declare f public.kalling_portal_files; begin
 perform 1 from public.kalling_portals where id=p_portal for update;
 perform kalling_private.portal_files_need(p_portal,array['firm-write']);
 if coalesce(p_sha256,'')!~'^[0-9a-f]{64}$' then raise exception 'File fingerprint missing'; end if;
 if p_size is null or p_size not between 1 and 10485760 or p_mime is distinct from 'application/pdf' or p_name is null or p_name!~*'[.]pdf$' then raise exception 'Firm documents must be PDFs up to 10 MB.'; end if;
 select * into f from public.kalling_portal_files where portal_id=p_portal and sha256=p_sha256 and status='stored';
 if f.id is not null then
  if f.size<>p_size or f.mime<>p_mime then raise exception 'The size and type must match the existing file fingerprint.'; end if;
  return jsonb_build_object('file',to_jsonb(f)-'object_path'-'uploaded_by','duplicate',true);
 end if;
 select * into f from public.kalling_portal_files where portal_id=p_portal and request_id is null and sha256=p_sha256 and status='reserved' and uploaded_by=auth.uid() and created_at>now()-interval '1 day' order by created_at desc limit 1;
 if f.id is not null and (f.size<>p_size or f.mime<>p_mime) then raise exception 'The size and type must match the existing file fingerprint.'; end if;
 if f.id is null then
  if (select count(*) from public.kalling_portal_files where portal_id=p_portal)>=100 then raise exception 'This portal has reached its 100-file limit.'; end if;
  if (select coalesce(sum(size),0) from public.kalling_portal_files where portal_id=p_portal)+p_size>209715200 then raise exception 'This portal has reached its storage limit. Contact your help contact.'; end if;
  insert into public.kalling_portal_files(portal_id,request_id,name,mime,size,sha256,object_path,uploaded_by,uploader_name,side)
   values(p_portal,null,left(trim(p_name),200),p_mime,p_size,p_sha256,p_portal::text||'/'||gen_random_uuid()::text||'/'||gen_random_uuid()::text,auth.uid(),kalling_private.actor_name(),'firm') returning * into f;
 end if;
 return jsonb_build_object('file',to_jsonb(f)-'uploaded_by','duplicate',false,'uploaded',exists(select 1 from storage.objects o where o.bucket_id='kalling-portal' and o.name=f.object_path));
end $$;
commit;
