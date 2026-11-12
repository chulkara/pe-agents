-- Kalling: advisor checks on buyers' ability to pay. Advisors record whether proof of funds or a lender
-- pre-qualification was seen, with a private note. Buyers never read these rows.
begin;
create table public.kalling_buyer_checks (
 buyer_id uuid primary key references public.kalling_buyers(id) on delete cascade,
 funds text not null default 'Not checked' check(funds in ('Not checked','Requested','Proof of funds received','Lender pre-qualified','Not sufficient')),
 note text not null default '' check(length(note)<=2000),
 checked_at timestamptz not null default now(), checked_by uuid references auth.users(id), checked_by_email text not null default ''
);
alter table public.kalling_buyer_checks enable row level security;
create policy buyer_checks_read on public.kalling_buyer_checks for select to authenticated using(kalling_private.advisor_role() is not null);
revoke all on public.kalling_buyer_checks from public,anon,authenticated;
grant select on public.kalling_buyer_checks to authenticated;

create function public.kalling_buyer_check(p_buyer uuid,p_funds text,p_note text) returns void language plpgsql security definer set search_path='' as $$
begin perform kalling_private.need_advisor();
 if p_funds not in ('Not checked','Requested','Proof of funds received','Lender pre-qualified','Not sufficient') then raise exception 'Choose a verification status.'; end if;
 if not exists(select 1 from public.kalling_buyers where id=p_buyer) then raise exception 'Buyer not found.'; end if;
 insert into public.kalling_buyer_checks(buyer_id,funds,note,checked_at,checked_by,checked_by_email)
 values(p_buyer,p_funds,left(coalesce(p_note,''),2000),now(),auth.uid(),coalesce((select email from auth.users where id=auth.uid()),''))
 on conflict(buyer_id) do update set funds=excluded.funds,note=excluded.note,checked_at=excluded.checked_at,checked_by=excluded.checked_by,checked_by_email=excluded.checked_by_email;
end $$;
revoke all on function public.kalling_buyer_check(uuid,text,text) from public,anon;
grant execute on function public.kalling_buyer_check(uuid,text,text) to authenticated;
commit;
