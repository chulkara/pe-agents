-- Kalling: engagement letters signed in the owner portal. Apply after 004.
-- The firm drafts a letter; once it is ready to sign its text is frozen and the database stores a
-- SHA-256 hash of that exact text. The owner signs by typing the name on the letter, the advisor
-- countersigns, and only then do the owner's document requests become visible.
-- No IP addresses or device details are stored.
begin;

alter table public.kalling_portals add column requests_hidden boolean not null default false;

create table public.kalling_portal_letters (
 id uuid primary key default gen_random_uuid(),
 portal_id uuid not null references public.kalling_portals(id),
 version integer not null check(version between 1 and 50),
 template_version text not null check(length(template_version) between 3 and 80),
 input jsonb not null check(octet_length(input::text)<=8000),
 body text not null check(length(body) between 200 and 40000),
 text_hash text not null check(text_hash~'^[0-9a-f]{64}$'),
 status text not null default 'Draft' check(status in ('Draft','Ready to sign','Viewed by owner','Signed by owner','Countersigned','Void')),
 events jsonb not null default '[]',
 owner_signature jsonb, firm_signature jsonb, void_reason text,
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(portal_id,version)
);
create unique index kalling_portal_letters_open on public.kalling_portal_letters(portal_id) where status not in ('Void','Countersigned');
alter table public.kalling_portal_letters enable row level security;
create policy portal_letters_read on public.kalling_portal_letters for select to authenticated using(
 kalling_private.portal_role(portal_id) in ('firm-write','firm-read') or (kalling_private.portal_role(portal_id)='seller' and status<>'Draft'));
revoke all on public.kalling_portal_letters from public,anon,authenticated;
grant select on public.kalling_portal_letters to authenticated;

-- Owners do not see requests while the portal is waiting for a signed letter.
drop policy portal_requests_read on public.kalling_portal_requests;
create policy portal_requests_read on public.kalling_portal_requests for select to authenticated using(
 kalling_private.portal_role(portal_id) in ('firm-write','firm-read')
 or (kalling_private.portal_role(portal_id)='seller' and not (select p.requests_hidden from public.kalling_portals p where p.id=portal_id)));
create or replace function kalling_private.seller_request(p_request uuid) returns public.kalling_portal_requests language plpgsql security definer set search_path='' as $$
declare r public.kalling_portal_requests; begin
 select * into r from public.kalling_portal_requests where id=p_request for update;
 perform kalling_private.portal_need(r.portal_id,array['seller']);
 if (select requests_hidden from public.kalling_portals where id=r.portal_id) then raise exception 'Document requests open after the engagement letter is signed.'; end if;
 if r.status in ('Accepted','Not applicable') then raise exception 'This request is already complete.'; end if;
 return r;
end $$;

create function kalling_private.letter_event(l public.kalling_portal_letters,p_status text,p_note text default null) returns jsonb language sql stable security definer set search_path='' as $$
 select l.events||jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('status',p_status,'at',now(),'by',kalling_private.actor_name(),'note',p_note)))
$$;
create function kalling_private.same_name(a text,b text) returns boolean language sql immutable set search_path='' as $$
 select length(trim(coalesce(b,'')))>=2 and lower(regexp_replace(trim(coalesce(a,'')),'\s+',' ','g'))=lower(regexp_replace(trim(coalesce(b,'')),'\s+',' ','g'))
$$;

create function public.kalling_portal_set_gate(p_portal uuid,p_hidden boolean) returns void language plpgsql security definer set search_path='' as $$
begin perform kalling_private.portal_need(p_portal,array['firm-write']);
 if not coalesce(p_hidden,false) and exists(select 1 from public.kalling_portal_letters where portal_id=p_portal and status not in ('Void','Countersigned')) then raise exception 'Requests open when the letter is countersigned.'; end if;
 update public.kalling_portals set requests_hidden=coalesce(p_hidden,false) where id=p_portal;
end $$;

create function public.kalling_letter_save(p_portal uuid,p_letter jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare l public.kalling_portal_letters; body text=coalesce(p_letter->>'text',''); v integer; new_id uuid; begin
 perform kalling_private.portal_need(p_portal,array['firm-write']);
 if (select status from public.kalling_portals where id=p_portal)='Closed' then raise exception 'This portal is closed.'; end if;
 if length(body)<200 then raise exception 'Fill in the letter first.'; end if;
 if coalesce(p_letter->'input'->>'ownerName','')='' or coalesce(p_letter->'input'->>'advisorName','')='' then raise exception 'The letter needs the owner and the advisor.'; end if;
 if p_letter ? 'id' and nullif(p_letter->>'id','') is not null then
  select * into l from public.kalling_portal_letters where id=(p_letter->>'id')::uuid and portal_id=p_portal for update;
  if l.id is null then raise exception 'Letter not found.'; end if;
  if l.status<>'Draft' then raise exception 'Only a draft letter can be edited. Void it and start a new version.'; end if;
  update public.kalling_portal_letters set input=p_letter->'input',body=body,text_hash=encode(sha256(convert_to(body,'UTF8')),'hex'),template_version=left(p_letter->>'templateVersion',80),updated_at=now() where id=l.id;
  return l.id;
 end if;
 if exists(select 1 from public.kalling_portal_letters where portal_id=p_portal and status not in ('Void','Countersigned')) then raise exception 'This portal already has an open engagement letter.'; end if;
 select coalesce(max(version),0)+1 into v from public.kalling_portal_letters where portal_id=p_portal;
 insert into public.kalling_portal_letters(portal_id,version,template_version,input,body,text_hash,events,created_by)
 values(p_portal,v,left(coalesce(p_letter->>'templateVersion',''),80),p_letter->'input',body,encode(sha256(convert_to(body,'UTF8')),'hex'),jsonb_build_array(jsonb_build_object('status','Draft','at',now(),'by',kalling_private.actor_name())),auth.uid())
 returning id into new_id;
 return new_id;
end $$;

create function public.kalling_letter_ready(p_letter uuid) returns void language plpgsql security definer set search_path='' as $$
declare l public.kalling_portal_letters; begin
 select * into l from public.kalling_portal_letters where id=p_letter for update;
 perform kalling_private.portal_need(l.portal_id,array['firm-write']);
 if l.status<>'Draft' then raise exception 'This letter was already sent.'; end if;
 update public.kalling_portal_letters set status='Ready to sign',events=kalling_private.letter_event(l,'Ready to sign'),updated_at=now() where id=l.id;
end $$;

create function public.kalling_letter_viewed(p_letter uuid) returns void language plpgsql security definer set search_path='' as $$
declare l public.kalling_portal_letters; begin
 select * into l from public.kalling_portal_letters where id=p_letter for update;
 perform kalling_private.portal_need(l.portal_id,array['seller']);
 if l.status='Ready to sign' then update public.kalling_portal_letters set status='Viewed by owner',events=kalling_private.letter_event(l,'Viewed by owner'),updated_at=now() where id=l.id; end if;
end $$;

create function public.kalling_letter_sign(p_letter uuid,p_name text,p_agree boolean) returns void language plpgsql security definer set search_path='' as $$
declare l public.kalling_portal_letters; mail text; begin
 select * into l from public.kalling_portal_letters where id=p_letter for update;
 perform kalling_private.portal_need(l.portal_id,array['seller']);
 if l.status not in ('Ready to sign','Viewed by owner') then raise exception 'This letter is not waiting for your signature.'; end if;
 if not coalesce(p_agree,false) then raise exception 'Agree to sign electronically first.'; end if;
 if not kalling_private.same_name(p_name,l.input->>'ownerName') then raise exception 'Type your full name exactly as it appears on the letter: %',l.input->>'ownerName'; end if;
 select lower(email) into mail from auth.users where id=auth.uid();
 update public.kalling_portal_letters set status='Signed by owner',events=kalling_private.letter_event(l,'Signed by owner'),updated_at=now(),
  owner_signature=jsonb_build_object('name',regexp_replace(trim(p_name),'\s+',' ','g'),'email',mail,'at',now(),'consent',true) where id=l.id;
end $$;

create function public.kalling_letter_countersign(p_letter uuid,p_name text,p_agree boolean) returns void language plpgsql security definer set search_path='' as $$
declare l public.kalling_portal_letters; mail text; begin
 select * into l from public.kalling_portal_letters where id=p_letter for update;
 perform kalling_private.portal_need(l.portal_id,array['firm-write']);
 if l.status<>'Signed by owner' then raise exception 'The owner has not signed yet.'; end if;
 if not coalesce(p_agree,false) then raise exception 'Agree to sign electronically first.'; end if;
 if not kalling_private.same_name(p_name,l.input->>'advisorName') then raise exception 'Type the advisor’s name exactly as it appears on the letter: %',l.input->>'advisorName'; end if;
 select lower(email) into mail from auth.users where id=auth.uid();
 update public.kalling_portal_letters set status='Countersigned',events=kalling_private.letter_event(l,'Countersigned'),updated_at=now(),
  firm_signature=jsonb_build_object('name',regexp_replace(trim(p_name),'\s+',' ','g'),'email',mail,'at',now(),'consent',true) where id=l.id;
 update public.kalling_portals set requests_hidden=false where id=l.portal_id;
 insert into public.kalling_audit(firm_id,actor_id,event,detail) select firm_id,auth.uid(),'portal.letter_countersigned',jsonb_build_object('portal_id',id,'letter_id',l.id,'text_hash',l.text_hash) from public.kalling_portals where id=l.portal_id;
end $$;

create function public.kalling_letter_void(p_letter uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare l public.kalling_portal_letters; begin
 select * into l from public.kalling_portal_letters where id=p_letter for update;
 perform kalling_private.portal_need(l.portal_id,array['firm-write']);
 if l.status in ('Countersigned','Void') then raise exception 'A countersigned letter cannot be voided here.'; end if;
 if length(trim(coalesce(p_reason,'')))<5 then raise exception 'Say why the letter is void.'; end if;
 update public.kalling_portal_letters set status='Void',void_reason=left(trim(p_reason),500),events=kalling_private.letter_event(l,'Void',left(trim(p_reason),500)),updated_at=now() where id=l.id;
end $$;

revoke all on function kalling_private.letter_event(public.kalling_portal_letters,text,text),kalling_private.same_name(text,text) from public,anon,authenticated;
revoke all on function public.kalling_portal_set_gate(uuid,boolean),public.kalling_letter_save(uuid,jsonb),public.kalling_letter_ready(uuid),public.kalling_letter_viewed(uuid),public.kalling_letter_sign(uuid,text,boolean),public.kalling_letter_countersign(uuid,text,boolean),public.kalling_letter_void(uuid,text) from public,anon;
grant execute on function public.kalling_portal_set_gate(uuid,boolean),public.kalling_letter_save(uuid,jsonb),public.kalling_letter_ready(uuid),public.kalling_letter_viewed(uuid),public.kalling_letter_sign(uuid,text,boolean),public.kalling_letter_countersign(uuid,text,boolean),public.kalling_letter_void(uuid,text) to authenticated;
commit;
