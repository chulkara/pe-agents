-- Explicit subscriptions and a durable, review-gated outbox. No live email transport is enabled.
begin;
create table kalling_private.alert_preferences(buyer_id uuid primary key references public.kalling_buyers(id),preference jsonb not null);
create table kalling_private.alert_matches(buyer_id uuid references public.kalling_buyers(id),listing_id uuid references public.kalling_listings(id),matched boolean not null,primary key(buyer_id,listing_id));
create table kalling_private.alert_outbox(id uuid primary key default gen_random_uuid(),business_key text not null unique,buyer_id uuid not null references public.kalling_buyers(id),payload jsonb not null,status text not null default 'Awaiting review' check(status in ('Awaiting review','Approved','Sending','Provider accepted','Failed','Delivery uncertain','Suppressed','Simulated')),approved_snapshot text,approved_by uuid,attempts int not null default 0,next_attempt timestamptz not null default now(),lease uuid,lease_until timestamptz,provider_id text,notice text not null default 'Email delivery is not configured. Preview only.',created_at timestamptz not null default now());
alter table kalling_private.alert_preferences enable row level security;
alter table kalling_private.alert_matches enable row level security;
alter table kalling_private.alert_outbox enable row level security;
revoke all on kalling_private.alert_preferences,kalling_private.alert_matches,kalling_private.alert_outbox from public,anon,authenticated;
create function kalling_private.alert_match(p jsonb,l public.kalling_listings) returns boolean language sql immutable set search_path='' as $$
 select l.status='Live' and not l.sample and l.asking_price>0 and (coalesce((p->>'allRegions')::boolean,false) or p->'regions' ? l.region) and nullif(p->>'maxPrice','')::numeric>0 and l.asking_price<=nullif(p->>'maxPrice','')::numeric and l.asking_price>=coalesce(nullif(p->>'minPrice','')::numeric,0)
$$;
create function kalling_private.alert_item(l public.kalling_listings) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('id',l.id,'number',l.number,'headline',l.headline,'region',l.region,'askingPrice',l.asking_price,'summary',l.summary,'reason',l.region||'; asking price is within your selected budget.')
$$;
create function kalling_private.alert_payload(b public.kalling_buyers,p jsonb,items jsonb) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('buyerId',b.id,'preferenceVersion',(p->>'version')::int,'recipient',b.email,'items',items,'subject',case when jsonb_array_length(items)=1 then 'HVAC listing: '||(items->0->>'number') else 'HVAC listings matching your search' end,'text',(select string_agg((i->>'number')||': '||(i->>'headline')||E'\n'||(i->>'region')||'. Asking price: $'||trim(to_char((i->>'askingPrice')::numeric,'FM999,999,999,999,990'))||E'\n'||(i->>'summary')||E'\n'||(i->>'reason')||E'\nhttps://chulkara.github.io/pe-agents/#/listings/'||(i->>'number'),E'\n\n' order by n) from jsonb_array_elements(items) with ordinality a(i,n))||E'\n\nMore public results: https://chulkara.github.io/pe-agents/#/listings\nPreferences: https://chulkara.github.io/pe-agents/#/account\nUnsubscribe: https://chulkara.github.io/pe-agents/#/unsubscribe?token='||(p->>'token'))
$$;
create function kalling_private.alert_current(m kalling_private.alert_outbox) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(exists(select 1 from kalling_private.alert_preferences a join public.kalling_buyers b on b.id=a.buyer_id join auth.users u on u.id=b.user_id where a.buyer_id=m.buyer_id and b.status<>'Restricted' and u.email_confirmed_at is not null and b.email=m.payload->>'recipient' and a.preference->>'frequency'<>'Off' and a.preference->>'consentAt' is not null and a.preference->>'version'=m.payload->>'preferenceVersion'
 and not exists(select 1 from jsonb_array_elements(m.payload->'items') i left join public.kalling_listings l on l.id=(i->>'id')::uuid where l.id is null or not kalling_private.alert_match(a.preference,l) or kalling_private.alert_item(l)<>i)),false)
$$;
create function kalling_private.alert_refresh() returns void language plpgsql security definer set search_path='' as $$
declare a record;l public.kalling_listings;b public.kalling_buyers;old boolean;items jsonb;one_item jsonb;key text;p_data jsonb;m kalling_private.alert_outbox;freq text;due timestamptz;begin
 perform 1 from kalling_private.brokerage_settings where id for update;
 -- If an approved draft is stale, replace its public preview and require review again.
 for m in select * from kalling_private.alert_outbox where status in ('Awaiting review','Approved','Failed','Suppressed') for update loop
  if not kalling_private.alert_current(m) then
   select * into b from public.kalling_buyers where id=m.buyer_id;select preference into p_data from kalling_private.alert_preferences where buyer_id=b.id;
   select coalesce(jsonb_agg(kalling_private.alert_item(li) order by li.number),'[]') into items from public.kalling_listings li where li.id in(select (i->>'id')::uuid from jsonb_array_elements(m.payload->'items') i) and kalling_private.alert_match(p_data,li);
   if b.status<>'Restricted' and p_data->>'frequency'<>'Off' and p_data->>'consentAt' is not null and jsonb_array_length(items)>0 and exists(select 1 from auth.users where id=b.user_id and email_confirmed_at is not null) then
    update kalling_private.alert_outbox set payload=kalling_private.alert_payload(b,p_data,items),status='Awaiting review',approved_snapshot=null,approved_by=null,lease=null,lease_until=null,notice='Preview changed. Review the recipient and content again.' where id=m.id;
   else update kalling_private.alert_outbox set status='Suppressed',lease=null,lease_until=null,notice='Consent, budget, listing availability or account changed.' where id=m.id;end if;
  end if;
 end loop;
 for a in select ap.* from kalling_private.alert_preferences ap join public.kalling_buyers bb on bb.id=ap.buyer_id join auth.users u on u.id=bb.user_id where bb.status<>'Restricted' and u.email_confirmed_at is not null and ap.preference->>'frequency'<>'Off' and ap.preference->>'consentAt' is not null loop
  select * into b from public.kalling_buyers where id=a.buyer_id;items='[]';freq=a.preference->>'frequency';due=case when freq='Daily digest' then date_trunc('day',now())+interval '1 day' when freq='Weekly digest' then date_trunc('week',now())+interval '1 week' else now() end;
  for l in select * from public.kalling_listings where status='Live' and not sample order by number loop
   select matched into old from kalling_private.alert_matches where buyer_id=b.id and listing_id=l.id;
   if kalling_private.alert_match(a.preference,l) and not coalesce(old,false) then
    one_item=kalling_private.alert_item(l);key=b.id::text||'|'||l.id::text||'|'||l.region||'|'||l.asking_price::text;
    if not exists(select 1 from kalling_private.alert_outbox o where o.buyer_id=b.id and exists(select 1 from jsonb_array_elements(o.payload->'items') i where i->>'id'=l.id::text and i->>'region'=l.region and (i->>'askingPrice')::numeric=l.asking_price)) then
     if freq='Individual alerts' then insert into kalling_private.alert_outbox(business_key,buyer_id,payload,next_attempt) values(key,b.id,kalling_private.alert_payload(b,a.preference,jsonb_build_array(one_item)),due) on conflict do nothing;
     else items=items||jsonb_build_array(one_item);end if;
    end if;
   end if;
   insert into kalling_private.alert_matches values(b.id,l.id,kalling_private.alert_match(a.preference,l)) on conflict(buyer_id,listing_id) do update set matched=excluded.matched;
  end loop;
  -- At most ten items per message; additional items get their own reviewable batch.
  if jsonb_array_length(items)>0 then
   for key,items in select b.id::text||'|digest|'||md5(j.value::text),j.value from (select jsonb_agg(e order by n) value from jsonb_array_elements(items) with ordinality z(e,n) group by (n-1)/10) j loop
    insert into kalling_private.alert_outbox(business_key,buyer_id,payload,next_attempt) values(key,b.id,kalling_private.alert_payload(b,a.preference,items),due) on conflict do nothing;
   end loop;
  end if;
 end loop;
end $$;
create function public.kalling_alert_preferences(p jsonb default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.kalling_buyers=kalling_private.my_buyer();old jsonb;out jsonb;lo numeric;hi numeric;f text;rs jsonb;begin
 if b.id is null then raise exception 'Create a confirmed buyer profile first.' using errcode='42501';end if;
 perform 1 from public.kalling_buyers where id=b.id for update;select preference into old from kalling_private.alert_preferences where buyer_id=b.id;
 if p is null then return coalesce(old,jsonb_build_object('buyerId',b.id,'version',0,'frequency','Off','regions','[]'::jsonb,'allRegions',false,'minPrice',null,'maxPrice',null,'consentAt',null,'token','','updatedAt',''));end if;
 lo=nullif(p->>'minPrice','')::numeric;hi=nullif(p->>'maxPrice','')::numeric;f=p->>'frequency';rs=coalesce(p->'regions','[]');
 if f is null or f not in ('Off','Individual alerts','Daily digest','Weekly digest') or lo<0 or hi<0 or lo>hi or lo<>trunc(lo) or hi<>trunc(hi) or lo>1e12 or hi>1e12 or lo::text='NaN' or hi::text='NaN' then raise exception 'Choose a frequency and valid whole-dollar price boundaries.';end if;
 if jsonb_typeof(rs)<>'array' or exists(select 1 from jsonb_array_elements_text(rs) r where r not in ('North Jersey','Central Jersey','South Jersey','Jersey Shore','New York City','Long Island','Hudson Valley','Westchester & Rockland')) then raise exception 'Choose a NJ/NY region.';end if;
 if f<>'Off' and (coalesce((p->>'consent')::boolean,false) is not true or hi is null or hi<=0 or (not coalesce((p->>'allRegions')::boolean,false) and jsonb_array_length(rs)=0)) then raise exception 'Confirm consent, regions and maximum asking price.';end if;
 out=jsonb_build_object('buyerId',b.id,'version',coalesce((old->>'version')::int,0)+1,'frequency',f,'regions',rs,'allRegions',coalesce((p->>'allRegions')::boolean,false),'minPrice',lo,'maxPrice',hi,'consentAt',case when f<>'Off' then now() end,'updatedAt',now(),'token',coalesce(old->>'token',replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','')));
 insert into kalling_private.alert_preferences values(b.id,out) on conflict(buyer_id) do update set preference=excluded.preference;
 update kalling_private.alert_outbox set status='Suppressed',lease=null,lease_until=null,notice='Preferences changed.' where buyer_id=b.id and status in ('Awaiting review','Approved','Sending','Failed');
 perform kalling_private.alert_refresh();return out;
end $$;
create function public.kalling_alert_unsubscribe(p_token text) returns void language plpgsql security definer set search_path='' as $$
declare b uuid;begin
 if p_token!~'^[0-9a-f]{64}$' then return;end if;
 update kalling_private.alert_preferences set preference=preference||jsonb_build_object('frequency','Off','consentAt',null,'version',(preference->>'version')::int+1) where preference->>'token'=p_token returning buyer_id into b;
 update kalling_private.alert_outbox set status='Suppressed',lease=null,lease_until=null,notice='Subscription stopped.' where buyer_id=b and status in ('Awaiting review','Approved','Sending','Failed');
end $$;
create function public.kalling_alert_refresh() returns void language plpgsql security definer set search_path='' as $$begin perform kalling_private.need_advisor();perform kalling_private.alert_refresh();end $$;
create function public.kalling_alert_queue() returns jsonb language plpgsql security definer set search_path='' as $$begin perform kalling_private.need_advisor();return coalesce((select jsonb_agg(o.payload||jsonb_build_object('id',o.id,'key',o.business_key,'status',o.status,'attempts',o.attempts,'createdAt',o.created_at,'notice',o.notice,'nextAttempt',extract(epoch from o.next_attempt)*1000,'snapshot',md5(o.payload::text)) order by o.created_at desc) from kalling_private.alert_outbox o),'[]');end $$;
create function public.kalling_alert_approve(p_id uuid,p_snapshot text) returns void language plpgsql security definer set search_path='' as $$declare o kalling_private.alert_outbox;begin
 perform kalling_private.need_advisor();select * into o from kalling_private.alert_outbox where id=p_id for update;
 if o.status not in ('Awaiting review','Approved','Failed') or md5(o.payload::text) is distinct from p_snapshot or not kalling_private.alert_current(o) then raise exception 'Preview or consent changed. Refresh and review again.';end if;
 update kalling_private.alert_outbox set status='Approved',approved_snapshot=p_snapshot,approved_by=auth.uid(),notice='Approved preview. Email delivery is not configured.' where id=o.id;
end $$;
create function kalling_private.alert_claim(p_id uuid,p_preview boolean default false) returns uuid language plpgsql security definer set search_path='' as $$declare o kalling_private.alert_outbox;t uuid=gen_random_uuid();begin
 select * into o from kalling_private.alert_outbox where id=p_id for update skip locked;if o.id is null then return null;end if;
 if o.status='Sending' and o.lease_until<=now() then update kalling_private.alert_outbox set status='Delivery uncertain',lease=null,lease_until=null,notice='Claim interrupted. Reconcile before retrying.' where id=o.id;return null;end if;
 if o.status not in ('Approved','Failed') or o.attempts>=3 or not p_preview and o.next_attempt>now() then return null;end if;
 if not kalling_private.alert_current(o) or o.approved_snapshot is distinct from md5(o.payload::text) or not exists(select 1 from public.kalling_members where user_id=o.approved_by and active and firm_id=kalling_private.house() and role in ('owner','admin','analyst')) then update kalling_private.alert_outbox set status='Suppressed',notice='Consent, approval or content changed.' where id=o.id;return null;end if;
 update kalling_private.alert_outbox set status='Sending',attempts=attempts+1,lease=t,lease_until=now()+interval '1 minute' where id=o.id;return t;
end $$;
create function kalling_private.alert_finish(p_id uuid,p_lease uuid,p_outcome text,p_provider text default null) returns void language plpgsql security definer set search_path='' as $$declare o kalling_private.alert_outbox;begin
 select * into o from kalling_private.alert_outbox where id=p_id for update;
 if o.status is distinct from 'Sending' or o.lease is distinct from p_lease or o.lease_until<=now() then raise exception 'Delivery lease no longer current.';end if;
 if p_outcome not in ('Simulated','Failed','Delivery uncertain','Provider accepted') or p_outcome='Provider accepted' and coalesce(length(p_provider),0)=0 then raise exception 'Record a real provider acknowledgment.';end if;
 update kalling_private.alert_outbox set status=case when kalling_private.alert_current(o) then p_outcome else 'Suppressed' end,provider_id=p_provider,lease=null,lease_until=null,next_attempt=now()+make_interval(secs=>least(3600,60*power(2,o.attempts)::int)),notice=case p_outcome when 'Simulated' then 'Simulated only. No email was sent.' when 'Provider accepted' then 'Provider accepted. Delivery and reading are not confirmed.' when 'Delivery uncertain' then 'Acknowledgment uncertain. Reconcile; do not retry.' else 'Known failure before acceptance. Bounded retry.' end where id=o.id;
end $$;
create function public.kalling_alert_simulate(p_id uuid) returns void language plpgsql security definer set search_path='' as $$declare t uuid;begin perform kalling_private.need_advisor();t=kalling_private.alert_claim(p_id,true);if t is null then raise exception 'Approve the current preview first.';end if;perform kalling_private.alert_finish(p_id,t,'Simulated');end $$;
-- Public listing changes prepare drafts only. Delivery always requires a separate human review.
create function kalling_private.alert_listing_changed() returns trigger language plpgsql security definer set search_path='' as $$begin perform kalling_private.alert_refresh();return new;end $$;
create trigger listing_alert_drafts after insert or update of status,asking_price,region,headline,summary on public.kalling_listings for each statement execute function kalling_private.alert_listing_changed();
revoke all on function kalling_private.alert_match(jsonb,public.kalling_listings),kalling_private.alert_item(public.kalling_listings),kalling_private.alert_payload(public.kalling_buyers,jsonb,jsonb),kalling_private.alert_current(kalling_private.alert_outbox),kalling_private.alert_refresh(),kalling_private.alert_claim(uuid,boolean),kalling_private.alert_finish(uuid,uuid,text,text),kalling_private.alert_listing_changed() from public,anon,authenticated;
revoke all on function public.kalling_alert_preferences(jsonb),public.kalling_alert_refresh(),public.kalling_alert_queue(),public.kalling_alert_approve(uuid,text),public.kalling_alert_simulate(uuid),public.kalling_alert_unsubscribe(text) from public,anon,authenticated;
grant execute on function public.kalling_alert_preferences(jsonb),public.kalling_alert_refresh(),public.kalling_alert_queue(),public.kalling_alert_approve(uuid,text),public.kalling_alert_simulate(uuid) to authenticated;
grant execute on function public.kalling_alert_unsubscribe(text) to anon,authenticated;
create function public.kalling_alert_claim(p_id uuid) returns uuid language sql security definer set search_path='' as $$select kalling_private.alert_claim(p_id)$$;
create function public.kalling_alert_complete(p_id uuid,p_lease uuid,p_outcome text,p_provider text default null) returns void language sql security definer set search_path='' as $$select kalling_private.alert_finish(p_id,p_lease,p_outcome,p_provider)$$;
revoke all on function public.kalling_alert_claim(uuid),public.kalling_alert_complete(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.kalling_alert_claim(uuid),public.kalling_alert_complete(uuid,uuid,text,text) to service_role;
create function kalling_private.alert_audit() returns trigger language plpgsql security definer set search_path='' as $$begin
 if tg_op='INSERT' or new.status is distinct from old.status then insert into public.kalling_audit(firm_id,actor_id,event,detail) values(kalling_private.house(),auth.uid(),'marketplace.alert',jsonb_build_object('id',new.id,'state',new.status));end if;return new;
end $$;
revoke all on function kalling_private.alert_audit() from public,anon,authenticated;
create trigger alert_outbox_audit after insert or update on kalling_private.alert_outbox for each row execute function kalling_private.alert_audit();
commit;
