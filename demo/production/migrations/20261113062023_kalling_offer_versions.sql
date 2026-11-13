begin;
alter table public.kalling_offers add column current_version integer not null default 1,add column term_details jsonb not null default '{}';
create table kalling_private.offer_versions(offer_id uuid not null references public.kalling_offers(id),version int not null,terms jsonb not null,legacy boolean not null default false,created_at timestamptz not null default now(),primary key(offer_id,version));
create table kalling_private.offer_shares(id uuid primary key default gen_random_uuid(),offer_id uuid not null,version int not null,note text not null default '',shared_by uuid,shared_at timestamptz not null default now(),foreign key(offer_id,version) references kalling_private.offer_versions(offer_id,version));
create table kalling_private.offer_owner_actions(id uuid primary key default gen_random_uuid(),portal_id uuid not null references public.kalling_portals(id),offer_id uuid not null,version int not null,kind text not null check(kind in ('Ask my advisor','Request clarification','Record a preferred offer')),message text not null,actor_id uuid not null,at timestamptz not null default now(),foreign key(offer_id,version) references kalling_private.offer_versions(offer_id,version));
create table kalling_private.offer_instructions(id uuid primary key default gen_random_uuid(),offer_id uuid not null,version int not null,instruction text not null,actor_id uuid not null,at timestamptz not null default now(),foreign key(offer_id,version) references kalling_private.offer_versions(offer_id,version));
alter table kalling_private.offer_versions enable row level security;alter table kalling_private.offer_shares enable row level security;alter table kalling_private.offer_owner_actions enable row level security;alter table kalling_private.offer_instructions enable row level security;
revoke all on kalling_private.offer_versions,kalling_private.offer_shares,kalling_private.offer_owner_actions,kalling_private.offer_instructions from public,anon,authenticated;
create function kalling_private.offer_terms(o public.kalling_offers) returns jsonb language sql immutable set search_path='' as $$select jsonb_build_object('kind',o.kind,'price',o.price,'cashAtClose',o.cash_at_close,'sellerNote',o.seller_note,'earnout',o.earnout,'financing',o.financing,'closeDays',o.close_days,'conditions',o.conditions)||o.term_details$$;
insert into kalling_private.offer_versions(offer_id,version,terms,legacy,created_at) select id,1,kalling_private.offer_terms(o),true,created_at from public.kalling_offers o;
insert into kalling_private.offer_shares(offer_id,version,shared_at) select id,1,updated_at from public.kalling_offers where status in ('Shared with seller','Accepted','Countered');
create function kalling_private.offer_validate(p jsonb) returns jsonb language plpgsql immutable set search_path='' as $$declare k text;n numeric;out jsonb='{}';begin
 foreach k in array array['price','cashAtClose','sellerNote','earnout'] loop
  n=(p->>k)::numeric;if n is null or n<0 or n>1e12 or n::text='NaN' or n<>trunc(n) then raise exception 'Use nonnegative whole US dollars, without rounding.';end if;
 end loop;
 if (p->>'price')::numeric<=0 or (p->>'cashAtClose')::numeric+(p->>'sellerNote')::numeric+(p->>'earnout')::numeric<>(p->>'price')::numeric then raise exception 'Cash, seller note and maximum earnout must equal the headline price.';end if;
 if p->>'kind' is null or p->>'kind' not in ('Indication of interest','Letter of intent') or nullif(p->>'closeDays','')::numeric is null or (p->>'closeDays')::numeric not between 14 and 365 or (p->>'closeDays')::numeric<>trunc((p->>'closeDays')::numeric) then raise exception 'Choose an offer type and a closing timeline between 14 and 365 days.';end if;
 foreach k in array array['expiresOn','noteInterest','noteTerm','noteRepayment','noteSecurity','earnoutPeriod','earnoutConditions','earnoutPayment','financingConditions','financingDeadline','transition'] loop
  if length(coalesce(p->>k,''))>0 then
   if k in ('expiresOn','financingDeadline') and ((p->>k)!~'^\d{4}-\d{2}-\d{2}$' or (p->>k)::date::text<>p->>k) then raise exception 'Enter a valid stated date.';end if;
   out=out||jsonb_build_object(k,left(trim(p->>k),1000));
  end if;
 end loop;return out;
end $$;
create function kalling_private.offer_snapshot() returns trigger language plpgsql security definer set search_path='' as $$begin
 if tg_op='INSERT' or new.current_version<>old.current_version then insert into kalling_private.offer_versions(offer_id,version,terms,created_at) values(new.id,new.current_version,kalling_private.offer_terms(new),new.updated_at);end if;return new;
end $$;
create trigger offer_snapshot after insert or update on public.kalling_offers for each row execute function kalling_private.offer_snapshot();
create or replace function public.kalling_buyer_offer(p_listing uuid,p jsonb) returns void language plpgsql security definer set search_path='' as $$declare b public.kalling_buyers=kalling_private.my_buyer();details jsonb;begin
 if b.id is null or not kalling_private.has_access(p_listing) then raise exception 'Sign the NDA and wait for approval before asking questions or making an offer.' using errcode='42501';end if;
 if (select status from public.kalling_listings where id=p_listing) not in ('Live','Under LOI') then raise exception 'This listing is not accepting offers.';end if;
 details=kalling_private.offer_validate(p);
 insert into public.kalling_offers(listing_id,buyer_id,kind,price,cash_at_close,seller_note,earnout,financing,close_days,conditions,term_details) values(p_listing,b.id,p->>'kind',(p->>'price')::bigint,(p->>'cashAtClose')::bigint,(p->>'sellerNote')::bigint,(p->>'earnout')::bigint,left(coalesce(p->>'financing',''),200),(p->>'closeDays')::int,left(coalesce(p->>'conditions',''),2000),details);
end $$;
create function public.kalling_offer_versions(p_offer uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$declare o public.kalling_offers;begin
 select * into o from public.kalling_offers where id=p_offer;if o.id is null or not (coalesce(kalling_private.advisor_role(),'') in ('owner','admin','analyst','viewer') or o.buyer_id=(kalling_private.my_buyer()).id) then raise exception 'Offer access denied.' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',v.offer_id::text||':'||v.version,'offerId',v.offer_id,'version',v.version,'terms',v.terms,'createdAt',v.created_at,'legacy',v.legacy) order by v.version desc) from kalling_private.offer_versions v where v.offer_id=o.id),'[]');end $$;
create function public.kalling_offer_rows() returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 return coalesce((select jsonb_agg(case when coalesce(kalling_private.advisor_role(),'') in ('owner','admin','analyst','viewer') then to_jsonb(o) else to_jsonb(o)-'advisor_note' end order by o.created_at desc) from public.kalling_offers o where coalesce(kalling_private.advisor_role(),'') in ('owner','admin','analyst','viewer') or o.buyer_id=(kalling_private.my_buyer()).id),'[]');end $$;
revoke select on public.kalling_offers from authenticated;
create function public.kalling_offer_revise(p_offer uuid,p_version int,p jsonb) returns void language plpgsql security definer set search_path='' as $$declare o public.kalling_offers;details jsonb;begin
 select * into o from public.kalling_offers where id=p_offer for update;
 if o.buyer_id is distinct from (kalling_private.my_buyer()).id or not kalling_private.has_access(o.listing_id) then raise exception 'Only the currently approved buyer can revise this offer.' using errcode='42501';end if;
 if o.current_version<>p_version or o.status in ('Accepted','Withdrawn','Declined') or (select status from public.kalling_listings where id=o.listing_id) not in ('Live','Under LOI') then raise exception 'Open the current active offer.';end if;
 details=kalling_private.offer_validate(p);update public.kalling_offers set current_version=current_version+1,kind=p->>'kind',price=(p->>'price')::bigint,cash_at_close=(p->>'cashAtClose')::bigint,seller_note=(p->>'sellerNote')::bigint,earnout=(p->>'earnout')::bigint,financing=left(coalesce(p->>'financing',''),200),close_days=(p->>'closeDays')::int,conditions=left(coalesce(p->>'conditions',''),2000),term_details=details,status='Submitted',updated_at=now() where id=o.id;
end $$;
create function public.kalling_offer_share(p_offer uuid,p_version int,p_note text default '') returns void language plpgsql security definer set search_path='' as $$declare o public.kalling_offers;begin
 perform kalling_private.need_advisor();select * into o from public.kalling_offers where id=p_offer for update;
 if o.id is null or o.current_version<>p_version or o.status in ('Withdrawn','Declined') or nullif(o.term_details->>'expiresOn','')::date<current_date then raise exception 'Review the current active offer version.';end if;
 insert into kalling_private.offer_shares(offer_id,version,note,shared_by) values(o.id,p_version,left(coalesce(p_note,''),1500),auth.uid());update public.kalling_offers set status='Shared with seller',updated_at=now() where id=o.id;
 update public.kalling_portal_buyers pb set stage='Offer made',updated_at=now() from public.kalling_portals p,public.kalling_listing_private lp where pb.portal_id=p.id and p.firm_id=kalling_private.house() and p.company_id=lp.company_id and lp.listing_id=o.listing_id and pb.name=kalling_private.dataroom_label(o.listing_id,o.buyer_id);
 insert into public.kalling_audit(firm_id,actor_id,event,detail) values(kalling_private.house(),auth.uid(),'offer.shared',jsonb_build_object('offer',o.id,'version',p_version));
end $$;
create function public.kalling_owner_offers(p_portal uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$declare p public.kalling_portals;begin
 perform kalling_private.portal_need(p_portal,array['seller','firm-write','firm-read']);select * into p from public.kalling_portals where id=p_portal;
 return coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'version',s.version,'terms',v.terms,'legacy',v.legacy,'label',kalling_private.dataroom_label(o.listing_id,o.buyer_id),'verification',kalling_private.verification_badge(o.buyer_id),'receivedAt',v.created_at,'sharedAt',s.shared_at,'note',s.note,
 'status',case when not a.active then 'No longer available' when nullif(v.terms->>'expiresOn','')::date<current_date then 'Expired' when o.status in ('Withdrawn','Declined') then o.status when o.current_version<>s.version then 'Updated terms awaiting advisor review' else o.status end,
 'current',a.active and coalesce(nullif(v.terms->>'expiresOn','')::date>=current_date,true) and o.current_version=s.version and o.status not in ('Withdrawn','Declined'),
 'updatedTermsPending',o.current_version<>s.version,
 'actions',coalesce((select jsonb_agg(jsonb_build_object('offerId',ac.offer_id,'version',ac.version,'listingId',o.listing_id,'kind',ac.kind,'message',ac.message,'at',ac.at) order by ac.at) from kalling_private.offer_owner_actions ac where ac.portal_id=p.id and ac.offer_id=o.id and ac.version=s.version),'[]')) order by s.shared_at)
 from public.kalling_offers o join public.kalling_listing_private lp on lp.listing_id=o.listing_id
 join public.kalling_listings li on li.id=o.listing_id join public.kalling_buyers b on b.id=o.buyer_id
 join lateral(select * from kalling_private.offer_shares sh where sh.offer_id=o.id order by sh.shared_at desc,sh.id desc limit 1) s on true
 join kalling_private.offer_versions v on v.offer_id=o.id and v.version=s.version
 cross join lateral(select b.status<>'Restricted' and li.status in ('Live','Under LOI') and exists(select 1 from public.kalling_access ac where ac.listing_id=o.listing_id and ac.buyer_id=b.id and ac.status='Approved') active) a
 where lp.company_id=p.company_id and p.firm_id=kalling_private.house()),'[]');
end $$;
create function public.kalling_owner_offer_action(p_portal uuid,p_offer uuid,p_version int,p_kind text,p_message text) returns void language plpgsql security definer set search_path='' as $$declare offers jsonb;o jsonb;begin
 perform kalling_private.portal_need(p_portal,array['seller']);offers=public.kalling_owner_offers(p_portal);select i into o from jsonb_array_elements(offers) i where i->>'id'=p_offer::text and (i->>'version')::int=p_version;
 if o is null or not (o->>'current')::boolean then raise exception 'This shared version is no longer current. Ask your advisor for updated terms.';end if;
 if length(trim(coalesce(p_message,'')))<5 then raise exception 'Add a note for your advisor.';end if;
 insert into kalling_private.offer_owner_actions(portal_id,offer_id,version,kind,message,actor_id) values(p_portal,p_offer,p_version,p_kind,left(trim(p_message),1500),auth.uid());
 insert into public.kalling_portal_messages(portal_id,side,author_id,author,body) values(p_portal,'seller',auth.uid(),kalling_private.actor_name(),p_kind||' for offer version '||p_version||': '||left(p_message,1500)||' (Discussion only; not legal acceptance.)');
end $$;
create function public.kalling_offer_accept(p_offer uuid,p_version int,p_instruction text) returns void language plpgsql security definer set search_path='' as $$declare o public.kalling_offers;begin
 perform kalling_private.need_advisor();select * into o from public.kalling_offers where id=p_offer for update;
 if o.id is null or o.current_version<>p_version or o.status in ('Withdrawn','Declined') or not exists(select 1 from kalling_private.offer_shares where offer_id=o.id and version=p_version) or nullif(o.term_details->>'expiresOn','')::date<current_date or not exists(select 1 from public.kalling_access a join public.kalling_buyers b on b.id=a.buyer_id where a.listing_id=o.listing_id and a.buyer_id=o.buyer_id and a.status='Approved' and b.status<>'Restricted') then raise exception 'Share and review the current active version first.';end if;
 if length(trim(coalesce(p_instruction,'')))<10 then raise exception 'Record the owner instruction and how it was confirmed.';end if;
 insert into kalling_private.offer_instructions(offer_id,version,instruction,actor_id) values(o.id,p_version,left(p_instruction,2000),auth.uid());update public.kalling_offers set status='Accepted',updated_at=now() where id=o.id;
 if o.kind='Letter of intent' then update public.kalling_listings set status='Under LOI',updated_at=now() where id=o.listing_id and status='Live';end if;
end $$;
create or replace function public.kalling_offer_update(p_offer uuid,p_status text,p_note text) returns void language plpgsql security definer set search_path='' as $$declare o public.kalling_offers;begin
 select * into o from public.kalling_offers where id=p_offer for update;if o.id is null then raise exception 'Offer not found.';end if;
 if p_status='Shared with seller' then perform public.kalling_offer_share(o.id,o.current_version,'');return;end if;
 if p_status='Accepted' then perform public.kalling_offer_accept(o.id,o.current_version,p_note);return;end if;
 if coalesce(kalling_private.advisor_role(),'') in ('owner','admin','analyst') then
  if p_status not in ('Countered','Declined') then raise exception 'Use the current offer workflow.';end if;
  update public.kalling_offers set status=p_status,advisor_note=left(coalesce(p_note,''),1500),updated_at=now() where id=o.id;
 elsif o.buyer_id=(kalling_private.my_buyer()).id and p_status='Withdrawn' and o.status not in ('Accepted','Declined') then update public.kalling_offers set status='Withdrawn',updated_at=now() where id=o.id;
 else raise exception 'You can only withdraw your own open offer.' using errcode='42501';end if;
end $$;
revoke all on function kalling_private.offer_terms(public.kalling_offers),kalling_private.offer_validate(jsonb),kalling_private.offer_snapshot() from public,anon,authenticated;
revoke all on function public.kalling_offer_versions(uuid),public.kalling_offer_rows(),public.kalling_offer_revise(uuid,int,jsonb),public.kalling_offer_share(uuid,int,text),public.kalling_owner_offers(uuid),public.kalling_owner_offer_action(uuid,uuid,int,text,text),public.kalling_offer_accept(uuid,int,text) from public,anon;
grant execute on function public.kalling_offer_versions(uuid),public.kalling_offer_rows(),public.kalling_offer_revise(uuid,int,jsonb),public.kalling_offer_share(uuid,int,text),public.kalling_owner_offers(uuid),public.kalling_owner_offer_action(uuid,uuid,int,text,text),public.kalling_offer_accept(uuid,int,text) to authenticated;
commit;
