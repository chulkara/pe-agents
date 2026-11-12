-- Kalling: owner answers about the business, owner review of the memorandum, and files the firm
-- adds itself (such as the approved memorandum). Apply after 004.
begin;

create table public.kalling_portal_answers (
 portal_id uuid primary key references public.kalling_portals(id),
 history text not null default '' check(length(history)<=3000), services text not null default '' check(length(services)<=3000),
 strengths text not null default '' check(length(strengths)<=3000), team text not null default '' check(length(team)<=3000),
 after_sale text not null default '' check(length(after_sale)<=3000), updated_at timestamptz not null default now()
);
create table public.kalling_portal_reviews (
 id uuid primary key default gen_random_uuid(), portal_id uuid not null references public.kalling_portals(id),
 kind text not null check(kind in ('cim')), version integer not null check(version between 1 and 500), title text not null check(length(title) between 2 and 160),
 sections jsonb not null check(jsonb_typeof(sections)='array' and octet_length(sections::text)<=200000),
 status text not null default 'Waiting for owner' check(status in ('Waiting for owner','Changes requested','Approved','Withdrawn')),
 comments jsonb not null default '[]', created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), decided_at timestamptz
);
create index kalling_portal_reviews_portal on public.kalling_portal_reviews(portal_id,created_at);
alter table public.kalling_portal_answers enable row level security;
alter table public.kalling_portal_reviews enable row level security;
create policy portal_answers_read on public.kalling_portal_answers for select to authenticated using(kalling_private.portal_role(portal_id) is not null);
create policy portal_reviews_read on public.kalling_portal_reviews for select to authenticated using(kalling_private.portal_role(portal_id) is not null and status<>'Withdrawn');
revoke all on public.kalling_portal_answers,public.kalling_portal_reviews from public,anon,authenticated;
grant select on public.kalling_portal_answers,public.kalling_portal_reviews to authenticated;

create function public.kalling_portal_save_answers(p_portal uuid,p jsonb) returns void language plpgsql security definer set search_path='' as $$
begin perform kalling_private.portal_need(p_portal,array['seller']);
 insert into public.kalling_portal_answers(portal_id) values(p_portal) on conflict do nothing;
 update public.kalling_portal_answers set history=left(coalesce(p->>'history',history),3000),services=left(coalesce(p->>'services',services),3000),strengths=left(coalesce(p->>'strengths',strengths),3000),
  team=left(coalesce(p->>'team',team),3000),after_sale=left(coalesce(p->>'afterSale',after_sale),3000),updated_at=now() where portal_id=p_portal;
end $$;
create function public.kalling_portal_publish_review(p_portal uuid,p jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare r uuid; begin perform kalling_private.portal_need(p_portal,array['firm-write']);
 if jsonb_typeof(p->'sections')<>'array' or jsonb_array_length(p->'sections')<1 then raise exception 'Nothing to review.'; end if;
 update public.kalling_portal_reviews set status='Withdrawn' where portal_id=p_portal and kind=coalesce(p->>'kind','cim') and status='Waiting for owner';
 insert into public.kalling_portal_reviews(portal_id,kind,version,title,sections,created_by) values(p_portal,coalesce(p->>'kind','cim'),(p->>'version')::int,left(p->>'title',160),p->'sections',auth.uid()) returning id into r;
 return r;
end $$;
create function public.kalling_portal_decide_review(p_review uuid,p_decision text,p_comments jsonb) returns void language plpgsql security definer set search_path='' as $$
declare r public.kalling_portal_reviews; c jsonb; begin
 select * into r from public.kalling_portal_reviews where id=p_review for update;
 perform kalling_private.portal_need(r.portal_id,array['seller']);
 if r.status<>'Waiting for owner' then raise exception 'This was already answered.'; end if;
 if p_decision not in ('Approved','Changes requested') then raise exception 'Approve it or ask for changes.'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('section',left(x->>'section',40),'text',left(trim(x->>'text'),2000),'at',now())),'[]') into c from jsonb_array_elements(coalesce(p_comments,'[]')) x where length(trim(coalesce(x->>'text','')))>=3;
 if p_decision='Changes requested' and jsonb_array_length(c)=0 then raise exception 'Say what you would like changed.'; end if;
 update public.kalling_portal_reviews set status=p_decision,comments=c,decided_at=now() where id=r.id;
end $$;
-- Files the firm adds without a request. The same upload and finish steps as owner files.
create function public.kalling_portal_reserve_firm_file(p_portal uuid,p_name text,p_mime text,p_size bigint,p_sha256 text) returns jsonb language plpgsql security definer set search_path='' as $$
declare f public.kalling_portal_files; begin
 perform kalling_private.portal_need(p_portal,array['firm-write']);
 if coalesce(p_sha256,'')!~'^[0-9a-f]{64}$' then raise exception 'File fingerprint missing'; end if;
 perform 1 from public.kalling_portals where id=p_portal for update;
 select * into f from public.kalling_portal_files where portal_id=p_portal and sha256=p_sha256 and status='stored';
 if f.id is not null then return jsonb_build_object('file',to_jsonb(f)-'object_path'-'uploaded_by','duplicate',true); end if;
 if p_size not between 1 and 10485760 or p_mime<>'application/pdf' or p_name!~*'[.]pdf$' then raise exception 'Firm documents must be PDFs up to 10 MB.'; end if;
 if (select count(*) from public.kalling_portal_files where portal_id=p_portal)>=100 then raise exception 'This portal has reached its 100-file limit.'; end if;
 insert into public.kalling_portal_files(portal_id,request_id,name,mime,size,sha256,object_path,uploaded_by,uploader_name,side)
  values(p_portal,null,left(trim(p_name),200),p_mime,p_size,p_sha256,p_portal::text||'/'||gen_random_uuid()::text||'/'||gen_random_uuid()::text,auth.uid(),kalling_private.actor_name(),'firm') returning * into f;
 return jsonb_build_object('file',to_jsonb(f)-'uploaded_by','duplicate',false,'uploaded',false);
end $$;

revoke all on function public.kalling_portal_save_answers(uuid,jsonb),public.kalling_portal_publish_review(uuid,jsonb),public.kalling_portal_decide_review(uuid,text,jsonb),public.kalling_portal_reserve_firm_file(uuid,text,text,bigint,text) from public,anon;
grant execute on function public.kalling_portal_save_answers(uuid,jsonb),public.kalling_portal_publish_review(uuid,jsonb),public.kalling_portal_decide_review(uuid,text,jsonb),public.kalling_portal_reserve_firm_file(uuid,text,text,bigint,text) to authenticated;
commit;
