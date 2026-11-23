-- Party-appointed CPAs and attorneys.
-- A seller or buyer invites their own professional and chooses, document by document, what that
-- professional may open. Access is always re-checked as the party, at the moment of opening: if the
-- party can no longer open a document, neither can their professional. The brokerage cannot grant
-- or widen this access. Every open, allowed or denied, is logged and visible to the party.
begin;

create table kalling_private.pro_people(
 id uuid primary key default gen_random_uuid(),
 side text not null check(side in ('seller','buyer')),
 party_key uuid not null,           -- the buyer profile id, or the seller's portal id
 party_name text not null check(length(party_name) between 1 and 160),
 name text not null check(length(name) between 2 and 120),
 email text not null check(email=lower(email) and email~'^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' and length(email)<=254),
 firm text not null default '' check(length(firm)<=160),
 role text not null check(role in ('CPA','Attorney')),
 status text not null default 'Invited' check(status in ('Invited','Active','Removed')),
 user_id uuid references auth.users(id),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 accepted_at timestamptz, acknowledged_at timestamptz,
 expires_at timestamptz not null check(expires_at<=created_at+interval '366 days')
);
create unique index pro_people_open on kalling_private.pro_people(side,party_key,email) where status<>'Removed';
create table kalling_private.pro_invites(token_hash text primary key,professional_id uuid not null references kalling_private.pro_people(id),used_at timestamptz);
create table kalling_private.pro_grants(
 id uuid primary key default gen_random_uuid(),
 professional_id uuid not null references kalling_private.pro_people(id),
 source text not null check(source in ('dataroom','transaction')),
 doc_id uuid not null, doc_name text not null,
 granted_by uuid not null references auth.users(id), granted_at timestamptz not null default now(), revoked_at timestamptz
);
create unique index pro_grants_open on kalling_private.pro_grants(professional_id,source,doc_id) where revoked_at is null;
create table kalling_private.pro_events(id uuid primary key default gen_random_uuid(),professional_id uuid not null references kalling_private.pro_people(id),grant_id uuid references kalling_private.pro_grants(id),actor uuid,event text not null check(event in ('opened','denied')),at timestamptz not null default now());
create table kalling_private.pro_tickets(id uuid primary key default gen_random_uuid(),grant_id uuid not null references kalling_private.pro_grants(id),user_id uuid not null,bucket text not null,object_path text not null,created_at timestamptz not null default now());
create index pro_tickets_path on kalling_private.pro_tickets(object_path,user_id);
alter table kalling_private.pro_people enable row level security;alter table kalling_private.pro_invites enable row level security;
alter table kalling_private.pro_grants enable row level security;alter table kalling_private.pro_events enable row level security;alter table kalling_private.pro_tickets enable row level security;

-- The caller's own party key for a side: their buyer profile, or their first active seller portal.
create function kalling_private.pro_my_party(p_side text) returns table(party_key uuid,party_name text,user_id uuid) language sql stable security definer set search_path='' as $$
 select b.id,b.name,b.user_id from public.kalling_buyers b where p_side='buyer' and b.user_id=auth.uid() and b.status<>'Restricted'
 union all
 (select x.id,x.owner_name,x.seller_id from public.kalling_portals x where p_side='seller' and kalling_private.portal_role(x.id)='seller' order by x.created_at limit 1)
$$;

-- A closing document, judged as the party (not as the signed-in user).
create function kalling_private.pro_tx_file_ok(p_file uuid,p_side text,p_party uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
 declare f kalling_private.execution_files;t kalling_private.execution_transactions;r text=p_side;owner uuid;h jsonb;begin
 select * into f from kalling_private.execution_files where id=p_file;if not found or f.status<>'Stored' then return false;end if;
 select * into t from kalling_private.execution_transactions where id=f.transaction_id;
 if p_side='buyer' then
  if t.state='Abandoned' or t.buyer_id<>p_party or not exists(select 1 from public.kalling_buyers b where b.id=p_party and b.status<>'Restricted')
   or not exists(select 1 from public.kalling_access a where a.listing_id=t.listing_id and a.buyer_id=p_party and a.status='Approved') then return false;end if;
  select b.user_id into owner from public.kalling_buyers b where b.id=p_party;
 elsif p_side='seller' then
  if t.portal_id<>p_party or not exists(select 1 from public.kalling_portals x where x.id=p_party and x.status='Active') then return false;end if;
  select x.seller_id into owner from public.kalling_portals x where x.id=p_party;
 else return false;end if;
 if not kalling_private.execution_current(f.id) then return false;end if;
 if t.state<>'Closed' and f.uploaded_by=owner then return true;end if;
 if f.review is null or not (r=any(f.grants)) or (f.data->>'content'='Restricted lender' and r='seller') then return false;end if;
 if f.data->>'content'='Named counterparties' and (t.data#>'{identity,seller}' is null or t.data#>'{identity,buyer}' is null) then return false;end if;
 if t.state='Closed' then h=t.data->'closes'->-1->'handover';return case when r='buyer' then coalesce(h->'buyerFiles' ? f.id::text,false) else coalesce(h->'sellerFiles' ? f.id::text,false) end;end if;
 return true;end $$;

-- A data-room document, judged as the party.
create function kalling_private.pro_room_ok(p_item uuid,p_side text,p_party uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select case
  when p_side='seller' then i.portal_id=p_party and i.owner_status<>'Removed' and exists(select 1 from public.kalling_portals x where x.id=p_party and x.status='Active')
  when p_side='buyer' then i.owner_status='Approved' and kalling_private.dataroom_tier(i.listing_id,p_party)>=case when i.tier='After NDA' then 1 else 2 end
  else false end from public.kalling_dataroom_items i where i.id=p_item),false)
$$;
create function kalling_private.pro_doc_ok(p_source text,p_doc uuid,p_side text,p_party uuid) returns boolean language sql stable security definer set search_path='' as $$
 select case p_source when 'dataroom' then kalling_private.pro_room_ok(p_doc,p_side,p_party) when 'transaction' then kalling_private.pro_tx_file_ok(p_doc,p_side,p_party) else false end
$$;

-- Everything the party can open now, for the share picker.
create function kalling_private.pro_party_docs(p_side text,p_party uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(d order by d->>'group',d->>'name'),'[]') from (
  select jsonb_build_object('source','dataroom','id',i.id,'name',i.display_name,'group',case when p_side='buyer' then coalesce(l.number,'Listing')||' data room, ' else 'Data room, ' end||i.folder) d
   from public.kalling_dataroom_items i left join public.kalling_listings l on l.id=i.listing_id
   where (p_side='seller' and i.portal_id=p_party or p_side='buyer' and exists(select 1 from public.kalling_access a where a.listing_id=i.listing_id and a.buyer_id=p_party and a.status='Approved'))
    and kalling_private.pro_room_ok(i.id,p_side,p_party)
  union all
  select jsonb_build_object('source','transaction','id',f.id,'name',f.data->>'name','group','Closing documents')
   from kalling_private.execution_files f join kalling_private.execution_transactions t on t.id=f.transaction_id
   where (p_side='seller' and t.portal_id=p_party or p_side='buyer' and t.buyer_id=p_party) and kalling_private.pro_tx_file_ok(f.id,p_side,p_party)
 ) x
$$;

create function kalling_private.pro_need_party(p_side text) returns uuid language plpgsql stable security definer set search_path='' as $$
 declare k uuid;begin
 if p_side not in ('seller','buyer') then raise exception 'Choose seller or buyer.' using errcode='22023';end if;
 select party_key into k from kalling_private.pro_my_party(p_side);
 if k is null then raise exception 'Sign in with your % account first.',p_side using errcode='42501';end if;
 return k;end $$;
create function kalling_private.pro_owned(p_id uuid,p_side text) returns kalling_private.pro_people language plpgsql stable security definer set search_path='' as $$
 declare p kalling_private.pro_people;begin
 select * into p from kalling_private.pro_people where id=p_id and side=p_side and party_key=(select m.party_key from kalling_private.pro_my_party(p_side) m) and status<>'Removed';
 if not found then raise exception 'This professional is not on your list.' using errcode='42501';end if;return p;end $$;
-- The signed-in professional, by confirmed email and accepted invitation.
create function kalling_private.pro_me(p_id uuid) returns kalling_private.pro_people language sql stable security definer set search_path='' as $$
 select p.* from kalling_private.pro_people p join auth.users u on u.id=p.user_id
 where p.id=p_id and p.user_id=auth.uid() and u.email_confirmed_at is not null and lower(u.email)=p.email and p.status='Active' and p.expires_at>now()
$$;

create function public.kalling_pro_party_documents(p_side text) returns jsonb language sql stable security definer set search_path='' as $$
 select kalling_private.pro_party_docs(p_side,kalling_private.pro_need_party(p_side))
$$;

create function public.kalling_pro_party_list(p_side text) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object(
  'professional',jsonb_build_object('id',p.id,'side',p.side,'partyKey',p.party_key,'partyName',p.party_name,'name',p.name,'email',p.email,'firm',p.firm,'role',p.role,'status',p.status,'createdAt',p.created_at,'acceptedAt',p.accepted_at,'expiresAt',p.expires_at,'acknowledgedAt',p.acknowledged_at),
  'expired',p.expires_at<=now(),
  'grants',(select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'professionalId',g.professional_id,'source',g.source,'docId',g.doc_id,'docName',g.doc_name,'grantedAt',g.granted_at) order by g.granted_at),'[]') from kalling_private.pro_grants g where g.professional_id=p.id and g.revoked_at is null),
  'views',(select coalesce(jsonb_agg(jsonb_build_object('at',e.at,'event',e.event,'document',coalesce(g.doc_name,'A document')) order by e.at desc),'[]') from (select * from kalling_private.pro_events where professional_id=p.id order by at desc limit 200) e left join kalling_private.pro_grants g on g.id=e.grant_id)
 ) order by p.created_at),'[]')
 from kalling_private.pro_people p where p.side=p_side and p.party_key=kalling_private.pro_need_party(p_side) and p.status<>'Removed'
$$;

create function public.kalling_pro_add(p_side text,p_name text,p_email text,p_firm text,p_role text,p_days integer default 180) returns text language plpgsql security definer set search_path='' as $$
 declare k uuid;pn text;me text;tok text=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');v_id uuid;e text=lower(trim(coalesce(p_email,'')));begin
 k=kalling_private.pro_need_party(p_side);select party_name into pn from kalling_private.pro_my_party(p_side);
 select lower(email) into me from auth.users where id=auth.uid();
 if length(trim(coalesce(p_name,''))) not between 2 and 120 then raise exception 'Enter their name.' using errcode='22023';end if;
 if e!~'^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception 'Enter their email address.' using errcode='22023';end if;
 if e=me then raise exception 'Invite your professional with their own email, not yours.' using errcode='22023';end if;
 if p_role not in ('CPA','Attorney') then raise exception 'Choose CPA or attorney.' using errcode='22023';end if;
 if p_days is null or p_days not between 1 and 365 then raise exception 'Choose access of up to a year.' using errcode='22023';end if;
 if exists(select 1 from kalling_private.pro_people where side=p_side and party_key=k and email=e and status<>'Removed') then raise exception 'This person already has an invitation.' using errcode='23505';end if;
 if (select count(*) from kalling_private.pro_people where side=p_side and party_key=k and status<>'Removed')>=6 then raise exception 'You can add up to 6 professionals.' using errcode='22023';end if;
 insert into kalling_private.pro_people(side,party_key,party_name,name,email,firm,role,created_by,expires_at) values(p_side,k,pn,trim(p_name),e,left(trim(coalesce(p_firm,'')),160),p_role,auth.uid(),now()+make_interval(days=>p_days)) returning pro_people.id into v_id;
 insert into kalling_private.pro_invites(token_hash,professional_id) values(encode(sha256(convert_to(tok,'UTF8')),'hex'),v_id);
 return tok;end $$;

create function public.kalling_pro_remove(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
 declare p kalling_private.pro_people;begin
 select * into p from kalling_private.pro_people where id=p_id;if not found then raise exception 'This professional is not on your list.' using errcode='42501';end if;
 perform kalling_private.pro_owned(p_id,p.side);
 update kalling_private.pro_people set status='Removed' where id=p_id;
 update kalling_private.pro_grants set revoked_at=now() where professional_id=p_id and revoked_at is null;
 end $$;

create function public.kalling_pro_grant(p_id uuid,p_docs jsonb,p_confirmed boolean) returns void language plpgsql security definer set search_path='' as $$
 declare p kalling_private.pro_people;d jsonb;src text;doc uuid;nm text;begin
 select * into p from kalling_private.pro_people where id=p_id;if not found then raise exception 'This professional is not on your list.' using errcode='42501';end if;
 p=kalling_private.pro_owned(p_id,p.side);
 if p.expires_at<=now() then raise exception 'This professional’s access has expired. Add them again.' using errcode='42501';end if;
 if not coalesce(p_confirmed,false) then raise exception '%',case when p.side='buyer' then 'Confirm that your professional is bound to keep this confidential. Your NDA makes you responsible for them.' else 'Confirm that you want to share these documents.' end using errcode='22023';end if;
 if jsonb_typeof(p_docs)<>'array' or jsonb_array_length(p_docs) not between 1 and 200 then raise exception 'Choose at least one document.' using errcode='22023';end if;
 for d in select * from jsonb_array_elements(p_docs) loop
  src=d->>'source';doc=(d->>'id')::uuid;
  if not kalling_private.pro_doc_ok(src,doc,p.side,p.party_key) then raise exception 'You can only share documents you can open yourself.' using errcode='42501';end if;
  nm=case src when 'dataroom' then (select display_name from public.kalling_dataroom_items where id=doc) else (select data->>'name' from kalling_private.execution_files where id=doc) end;
  insert into kalling_private.pro_grants(professional_id,source,doc_id,doc_name,granted_by) values(p.id,src,doc,nm,auth.uid()) on conflict (professional_id,source,doc_id) where revoked_at is null do nothing;
 end loop;end $$;

create function public.kalling_pro_revoke(p_grant uuid) returns void language plpgsql security definer set search_path='' as $$
 declare g kalling_private.pro_grants;p kalling_private.pro_people;begin
 select * into g from kalling_private.pro_grants where id=p_grant;select * into p from kalling_private.pro_people where id=g.professional_id;
 if g.id is null or p.id is null then raise exception 'This share is not yours to change.' using errcode='42501';end if;
 begin perform kalling_private.pro_owned(p.id,p.side);exception when others then raise exception 'This share is not yours to change.' using errcode='42501';end;
 update kalling_private.pro_grants set revoked_at=now() where id=p_grant and revoked_at is null;end $$;

create function public.kalling_pro_accept(p_token text) returns void language plpgsql security definer set search_path='' as $$
 declare i kalling_private.pro_invites;p kalling_private.pro_people;e text;ok boolean;begin
 select lower(email),email_confirmed_at is not null into e,ok from auth.users where id=auth.uid();
 if not coalesce(ok,false) then raise exception 'Confirm your email address first.' using errcode='42501';end if;
 select * into i from kalling_private.pro_invites where token_hash=encode(sha256(convert_to(coalesce(p_token,''),'UTF8')),'hex') for update;
 select * into p from kalling_private.pro_people where id=i.professional_id;
 if i.token_hash is null or i.used_at is not null or p.status<>'Invited' or p.expires_at<=now() then raise exception 'This invitation has expired, was used, or was withdrawn.' using errcode='42501';end if;
 if p.email<>e then raise exception 'Sign in with the email address the invitation was sent to.' using errcode='42501';end if;
 update kalling_private.pro_people set status='Active',accepted_at=now(),user_id=auth.uid() where id=p.id;
 update kalling_private.pro_invites set used_at=now() where token_hash=i.token_hash;end $$;

create function public.kalling_pro_acknowledge(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
 begin
 if (kalling_private.pro_me(p_id)).id is null then raise exception 'Sign in as the invited professional.' using errcode='42501';end if;
 update kalling_private.pro_people set acknowledged_at=coalesce(acknowledged_at,now()) where id=p_id;end $$;

create function public.kalling_pro_home() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object(
  'professional',jsonb_build_object('id',p.id,'side',p.side,'partyName',p.party_name,'name',p.name,'email',p.email,'firm',p.firm,'role',p.role,'status',p.status,'expiresAt',p.expires_at,'acknowledgedAt',p.acknowledged_at),
  'documents',case when p.acknowledged_at is null or p.expires_at<=now() then '[]'::jsonb else (select coalesce(jsonb_agg(jsonb_build_object('grantId',g.id,'name',g.doc_name,'source',g.source,'grantedAt',g.granted_at,'available',kalling_private.pro_doc_ok(g.source,g.doc_id,p.side,p.party_key)) order by g.granted_at),'[]') from kalling_private.pro_grants g where g.professional_id=p.id and g.revoked_at is null) end
 ) order by p.created_at),'[]')
 from kalling_private.pro_people p join auth.users u on u.id=p.user_id
 where p.user_id=auth.uid() and u.email_confirmed_at is not null and lower(u.email)=p.email and p.status='Active'
$$;

-- Opening logs first. Bytes are then read with an authenticated download that the storage policy
-- below allows only for two minutes, only for this user and object, and only while access holds.
create function public.kalling_pro_open(p_grant uuid) returns jsonb language plpgsql security definer set search_path='' as $$
 declare g kalling_private.pro_grants;p kalling_private.pro_people;ok boolean;bucket text;path text;mime text;begin
 select * into g from kalling_private.pro_grants where id=p_grant;select * into p from kalling_private.pro_people where id=g.professional_id;
 if p.id is null or p.user_id is distinct from auth.uid() then return jsonb_build_object('allowed',false);end if;
 ok=(kalling_private.pro_me(p.id)).id is not null and p.acknowledged_at is not null and g.revoked_at is null and kalling_private.pro_doc_ok(g.source,g.doc_id,p.side,p.party_key);
 insert into kalling_private.pro_events(professional_id,grant_id,actor,event) values(p.id,g.id,auth.uid(),case when ok then 'opened' else 'denied' end);
 if not ok then return jsonb_build_object('allowed',false);end if;
 if g.source='dataroom' then select 'kalling-portal',f.object_path,f.mime into bucket,path,mime from public.kalling_dataroom_items i join public.kalling_portal_files f on f.id=i.file_id where i.id=g.doc_id;
 else select case when f.portal_file_id is null then 'kalling-execution' else 'kalling-portal' end,f.object_path,coalesce(f.data->>'mime','application/pdf') into bucket,path,mime from kalling_private.execution_files f where f.id=g.doc_id;end if;
 insert into kalling_private.pro_tickets(grant_id,user_id,bucket,object_path) values(g.id,auth.uid(),bucket,path);
 return jsonb_build_object('allowed',true,'bucket',bucket,'path',path,'name',g.doc_name,'mime',mime,
  'watermark',p.name||', '||p.email||', '||p.role||' for '||p.party_name||', '||to_char(now() at time zone 'utc','YYYY-MM-DD')||'. Confidential, Kalling');
 end $$;

create function kalling_private.pro_ticket_ok(p_bucket text,p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(
  select 1 from kalling_private.pro_tickets t join kalling_private.pro_grants g on g.id=t.grant_id join kalling_private.pro_people p on p.id=g.professional_id
  where t.user_id=auth.uid() and t.bucket=p_bucket and t.object_path=p_path and t.created_at>now()-interval '2 minutes'
   and g.revoked_at is null and (kalling_private.pro_me(p.id)).id is not null and kalling_private.pro_doc_ok(g.source,g.doc_id,p.side,p.party_key))
$$;
create policy kalling_pro_read on storage.objects for select to authenticated using(
 bucket_id in ('kalling-portal','kalling-execution') and storage.allow_only_operation('object.get_authenticated')
 and kalling_private.pro_ticket_ok(bucket_id,name)
);

revoke all on function kalling_private.pro_my_party(text),kalling_private.pro_tx_file_ok(uuid,text,uuid),kalling_private.pro_room_ok(uuid,text,uuid),kalling_private.pro_doc_ok(text,uuid,text,uuid),kalling_private.pro_party_docs(text,uuid),kalling_private.pro_need_party(text),kalling_private.pro_owned(uuid,text),kalling_private.pro_me(uuid) from public,anon,authenticated;
revoke all on function kalling_private.pro_ticket_ok(text,text) from public,anon;grant execute on function kalling_private.pro_ticket_ok(text,text) to authenticated;
revoke all on function public.kalling_pro_party_documents(text),public.kalling_pro_party_list(text),public.kalling_pro_add(text,text,text,text,text,integer),public.kalling_pro_remove(uuid),public.kalling_pro_grant(uuid,jsonb,boolean),public.kalling_pro_revoke(uuid),public.kalling_pro_accept(text),public.kalling_pro_acknowledge(uuid),public.kalling_pro_home(),public.kalling_pro_open(uuid) from public,anon;
grant execute on function public.kalling_pro_party_documents(text),public.kalling_pro_party_list(text),public.kalling_pro_add(text,text,text,text,text,integer),public.kalling_pro_remove(uuid),public.kalling_pro_grant(uuid,jsonb,boolean),public.kalling_pro_revoke(uuid),public.kalling_pro_accept(text),public.kalling_pro_acknowledge(uuid),public.kalling_pro_home(),public.kalling_pro_open(uuid) to authenticated;
comment on table kalling_private.pro_people is 'A seller''s or buyer''s own CPA or attorney. Only that party can invite, share with or remove them.';
comment on function kalling_private.pro_ticket_ok(text,text) is 'Logged two-minute professional read ticket, re-checked against the party''s current access. Authenticated downloads only, never signed URLs.';
commit;
