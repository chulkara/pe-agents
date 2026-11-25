-- Kalling: the sale-ready page on the hosted system. The firm shares a reviewed snapshot with the
-- owner; the page is recomputed from the stored inputs in the browser, so the owner sees exactly what
-- the advisor reviewed. Only firm writers can share; the owner and the firm can read. Apply after 004.
begin;

create table public.kalling_portal_sale_ready (
 id uuid primary key default gen_random_uuid(),
 portal_id uuid not null references public.kalling_portals(id),
 version integer not null check(version between 1 and 1000),
 input jsonb not null check(jsonb_typeof(input)='object' and octet_length(input::text)<=60000),
 note text not null check(length(note) between 20 and 2000),
 by_name text not null check(length(by_name) between 1 and 120),
 created_by uuid not null references auth.users(id),
 shared_at timestamptz not null default now(),
 unique(portal_id,version)
);
alter table public.kalling_portal_sale_ready enable row level security;
create policy portal_sale_ready_read on public.kalling_portal_sale_ready for select to authenticated using(kalling_private.portal_role(portal_id) is not null);
revoke all on public.kalling_portal_sale_ready from public,anon,authenticated;
grant select on public.kalling_portal_sale_ready to authenticated;

create function public.kalling_portal_share_sale_ready(p_portal uuid,p_input jsonb,p_note text) returns uuid language plpgsql security definer set search_path='' as $$
declare p public.kalling_portals; v integer; r uuid; n text=left(trim(coalesce(p_note,'')),2000); rev numeric; begin
 perform kalling_private.portal_need(p_portal,array['firm-write']);
 select * into p from public.kalling_portals where id=p_portal for update;
 if p.status='Closed' then raise exception 'This portal is closed.'; end if;
 if length(n)<20 then raise exception 'Write a short note for the owner, at least 20 characters.'; end if;
 if jsonb_typeof(p_input) is distinct from 'object' or jsonb_typeof(p_input->'inputs') is distinct from 'object' or jsonb_typeof(coalesce(p_input->'addBacks','[]')) is distinct from 'array' or jsonb_typeof(coalesce(p_input->'requests','[]')) is distinct from 'array' then raise exception 'The sale-ready page is missing its numbers.'; end if;
 begin rev=(p_input->'inputs'->>'revenue')::numeric; exception when others then rev=null; end;
 if rev is null or rev<=0 then raise exception 'Enter the recast before sharing the sale-ready page.'; end if;
 if octet_length(p_input::text)>60000 then raise exception 'The sale-ready page is too large to share.'; end if;
 select coalesce(max(version),0)+1 into v from public.kalling_portal_sale_ready where portal_id=p_portal;
 insert into public.kalling_portal_sale_ready(portal_id,version,input,note,by_name,created_by)
  values(p_portal,v,p_input,n,left(coalesce(nullif(trim(p.help->>'name'),''),kalling_private.actor_name()),120),auth.uid()) returning id into r;
 return r;
end $$;
revoke all on function public.kalling_portal_share_sale_ready(uuid,jsonb,text) from public,anon;
grant execute on function public.kalling_portal_share_sale_ready(uuid,jsonb,text) to authenticated;
commit;
