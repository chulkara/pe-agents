-- The brokerage's sourcing decisions and history. The sample license list stays in the app.
-- No prospect contact, file upload, or delivery workflow is created here.
begin;

create table public.kalling_sourcing_decisions (
 license_no text primary key check (char_length(license_no) between 1 and 40
   and license_no=upper(btrim(regexp_replace(license_no,'[[:space:]]+',' ','g')))),
 status text not null check (status in ('New','Letter drafted','Letter approved','Mailed','Replied','Not interested','Do not contact')),
 letter text check (char_length(letter)<=4000),
 approved_by text,
 approved_at timestamptz,
 mailed_at timestamptz,
 note text check (char_length(note)<=400),
 updated_by text not null,
 updated_at timestamptz not null,
 check ((approved_by is null)=(approved_at is null)),
 check (approved_at is null or letter is not null),
 check (status not in ('Letter approved','Mailed','Replied','Not interested') or approved_at is not null),
 check (status not in ('Mailed','Replied','Not interested') or mailed_at is not null)
);

create table public.kalling_sourcing_events (
 id bigint generated always as identity primary key,
 license_no text not null references public.kalling_sourcing_decisions(license_no),
 from_status text not null,
 to_status text not null,
 "by" text not null,
 at timestamptz not null,
 note text check (char_length(note)<=400)
);
create index kalling_sourcing_events_license on public.kalling_sourcing_events(license_no,id);

alter table public.kalling_sourcing_decisions enable row level security;
alter table public.kalling_sourcing_events enable row level security;
revoke all on public.kalling_sourcing_decisions,public.kalling_sourcing_events from public,anon,authenticated,service_role;
revoke all on sequence public.kalling_sourcing_events_id_seq from public,anon,authenticated,service_role;

-- Preserve opt-outs even if a later database operation writes the decision table directly.
create function kalling_private.sourcing_keep_opt_out() returns trigger
language plpgsql set search_path='' as $$
begin
 raise exception 'Do not contact is permanent.' using errcode='55000';
end
$$;
create trigger kalling_sourcing_keep_opt_out
 before update or delete on public.kalling_sourcing_decisions
 for each row when (old.status='Do not contact')
 execute function kalling_private.sourcing_keep_opt_out();
alter table public.kalling_sourcing_decisions enable always trigger kalling_sourcing_keep_opt_out;

create function kalling_private.sourcing_keep_history() returns trigger
language plpgsql set search_path='' as $$
begin
 raise exception 'Sourcing history cannot be changed.' using errcode='55000';
end
$$;
create trigger kalling_sourcing_keep_history
 before update or delete or truncate on public.kalling_sourcing_events
 for each statement execute function kalling_private.sourcing_keep_history();
alter table public.kalling_sourcing_events enable always trigger kalling_sourcing_keep_history;

create function public.kalling_sourcing_decide(p_license text,p_status text,p_letter text,p_note text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_license text;
 v_actor text;
 v_old public.kalling_sourcing_decisions;
 v_new public.kalling_sourcing_decisions;
 v_letter text;
 v_at timestamptz;
 v_allowed text[];
 v_opt_out constant text := 'If you''d rather not hear from us, tell me and I won''t write again.';
begin
 perform kalling_private.need_advisor();
 v_actor=kalling_private.actor_name();
 if coalesce(v_actor,'Unknown')='Unknown' or v_actor !~ '[^[:space:]]' then
  raise exception 'Sign in with a named advisor account.' using errcode='42501';
 end if;
 if p_status is null or p_status not in ('New','Letter drafted','Letter approved','Mailed','Replied','Not interested','Do not contact') then
  raise exception 'Choose a sourcing decision.' using errcode='22023';
 end if;
 v_license=upper(btrim(regexp_replace(coalesce(p_license,''),'[[:space:]]+',' ','g')));
 if char_length(v_license) not between 1 and 40 then
  raise exception 'Use a license number between 1 and 40 characters.' using errcode='22023';
 end if;
 if char_length(p_note)>400 then
  raise exception 'Keep the note to 400 characters or fewer.' using errcode='22023';
 end if;
 if char_length(p_letter)>4000 then
  raise exception 'Keep the letter to 4,000 characters or fewer.' using errcode='22023';
 end if;
 -- Create the row before locking it so two first decisions cannot both start from New.
 -- A failed transition also rolls back this initialization.
 insert into public.kalling_sourcing_decisions(license_no,status,updated_by,updated_at)
 values (v_license,'New',v_actor,clock_timestamp()) on conflict (license_no) do nothing;
 select d.* into strict v_old from public.kalling_sourcing_decisions d where d.license_no=v_license for update;
 -- A staff role can change while another decision holds this lock.
 perform kalling_private.need_advisor();
 if p_status in ('Letter approved','Mailed') and coalesce(kalling_private.advisor_role(),'') not in ('owner','admin') then
  raise exception 'Only a firm owner or administrator can approve or mark a letter mailed.' using errcode='42501';
 end if;

 -- Keep these transitions in step with demo/lib/sourcing.ts.
 v_allowed=case v_old.status
  when 'New' then array['Letter drafted','Letter approved','Do not contact']
  when 'Letter drafted' then array['Letter drafted','Letter approved','Do not contact']
  when 'Letter approved' then array['Mailed','Do not contact']
  when 'Mailed' then array['Replied','Not interested','Do not contact']
  when 'Replied' then array['Not interested','Do not contact']
  when 'Not interested' then array['Do not contact']
  else array[]::text[]
 end;
 if v_old.status='Do not contact' then
  raise exception 'This owner asked not to be contacted.' using errcode='55000';
 end if;
 if not (p_status=any(v_allowed)) then
  if p_status='Mailed' and v_old.approved_at is null then
   raise exception 'Approve the letter before marking it mailed.' using errcode='55000';
  end if;
  raise exception 'This owner is already at "%". Decisions only move forward.',v_old.status using errcode='55000';
 end if;

 v_letter=v_old.letter;
 if p_status in ('Letter drafted','Letter approved') then
  v_letter=coalesce(p_letter,v_old.letter);
 elsif p_letter is not null and p_letter is distinct from v_old.letter then
  raise exception 'The letter can only change when drafting or approving it.' using errcode='22023';
 end if;
 if p_status='Letter approved' then
  if v_letter is null or char_length(v_letter) not between 1 and 4000 or v_letter !~ '[^[:space:]]' then
   raise exception 'Draft the letter before approving it.' using errcode='22023';
  end if;
  if strpos(v_letter,'--')>0 then
   raise exception 'Use single hyphens before approving the letter.' using errcode='22023';
  end if;
  if strpos(v_letter,v_opt_out)=0 then
   raise exception 'Keep Kalling''s opt-out sentence word for word: "%"',v_opt_out using errcode='22023';
  end if;
 end if;

 v_at=clock_timestamp();
 update public.kalling_sourcing_decisions d set
  status=p_status,
  letter=v_letter,
  approved_by=case when p_status='Letter approved' then v_actor else v_old.approved_by end,
  approved_at=case when p_status='Letter approved' then v_at else v_old.approved_at end,
  mailed_at=case when p_status='Mailed' then v_at else v_old.mailed_at end,
  note=coalesce(p_note,v_old.note),
  updated_by=v_actor,
  updated_at=v_at
 where d.license_no=v_license returning d.* into v_new;
 insert into public.kalling_sourcing_events(license_no,from_status,to_status,"by",at,note)
 values (v_license,v_old.status,p_status,v_actor,v_at,p_note);
 return to_jsonb(v_new);
end
$$;

create function public.kalling_sourcing_list() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform kalling_private.need_advisor();
 return coalesce((select jsonb_agg(to_jsonb(d) order by d.license_no) from public.kalling_sourcing_decisions d),'[]'::jsonb);
end
$$;

revoke all on function kalling_private.sourcing_keep_opt_out(),kalling_private.sourcing_keep_history()
 from public,anon,authenticated,service_role;
revoke all on function public.kalling_sourcing_decide(text,text,text,text),public.kalling_sourcing_list()
 from public,anon,authenticated,service_role;
grant execute on function public.kalling_sourcing_decide(text,text,text,text),public.kalling_sourcing_list()
 to authenticated;

commit;
