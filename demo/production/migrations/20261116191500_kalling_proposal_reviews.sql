-- Kalling: recorded human judgments on model proposals (Reviewed, Changes needed, Dismissed).
-- A judgment is append-only history naming the exact proposal snapshot. It approves nothing,
-- sends nothing, and never moves the transaction revision.
begin;

create table kalling_private.execution_proposal_reviews (
 id uuid primary key default gen_random_uuid(),
 transaction_id uuid not null references kalling_private.execution_transactions(id),
 packet_id text not null check(packet_id ~ '^[\w-]{8,120}$'),
 input_hash text not null check(input_hash ~ '^[0-9a-f]{64}$'),
 decision text not null check(decision in ('Reviewed','Changes needed','Dismissed')),
 note text not null default '' check(length(note)<=2000),
 by_user uuid not null references auth.users(id),
 by_name text not null,
 created_at timestamptz not null default now()
);
create index execution_proposal_reviews_tx on kalling_private.execution_proposal_reviews(transaction_id,created_at desc);
revoke all on kalling_private.execution_proposal_reviews from public,anon,authenticated;

create function public.kalling_execution_review_proposal(p_transaction uuid,p jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare t kalling_private.execution_transactions; j public.kalling_agent_jobs; v_decision text=p->>'decision'; v_note text=left(trim(coalesce(p->>'note','')),2000); v_id uuid; begin
 if kalling_private.execution_role(p_transaction) is distinct from 'advisor' then raise exception 'Only a brokerage reviewer can record a judgment.' using errcode='42501'; end if;
 select * into t from kalling_private.execution_transactions where id=p_transaction for share;
 if v_decision not in ('Reviewed','Changes needed','Dismissed') then raise exception 'Choose Reviewed, Changes needed or Dismissed.'; end if;
 if v_decision='Changes needed' and length(v_note)<5 then raise exception 'Say what needs to change, so the next preparation can address it.'; end if;
 -- The judgment names an exact prepared snapshot that exists for this transaction.
 select * into j from public.kalling_agent_jobs where kind='execution' and packet::jsonb->>'id'=p->>'packetId' and packet::jsonb#>>'{data,transactionId}'=p_transaction::text order by created_at desc limit 1;
 if j.id is null or j.packet::jsonb->>'inputHash' is distinct from p->>'inputHash' then raise exception 'The judgment must name the exact proposal snapshot.'; end if;
 -- A stale proposal can only be dismissed; marking it reviewed would misstate what was checked.
 if v_decision<>'Dismissed' and j.packet::jsonb#>>'{data,revision}' is distinct from t.revision::text then raise exception 'The transaction changed since this proposal was prepared. A stale proposal can be dismissed, not marked reviewed.'; end if;
 insert into kalling_private.execution_proposal_reviews(transaction_id,packet_id,input_hash,decision,note,by_user,by_name)
  values(p_transaction,p->>'packetId',p->>'inputHash',v_decision,v_note,auth.uid(),kalling_private.actor_name()) returning id into v_id;
 return v_id;
end $$;

create function public.kalling_execution_proposal_reviews(p_transaction uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$ begin
 if kalling_private.execution_role(p_transaction) not in ('advisor','viewer') or kalling_private.execution_role(p_transaction) is null then raise exception 'Model proposal access denied' using errcode='42501'; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'transactionId',r.transaction_id,'packetId',r.packet_id,'inputHash',r.input_hash,'decision',r.decision,'note',r.note,'by',r.by_name,'at',r.created_at) order by r.created_at desc),'[]')
  from kalling_private.execution_proposal_reviews r where r.transaction_id=p_transaction);
end $$;

revoke all on function public.kalling_execution_review_proposal(uuid,jsonb),public.kalling_execution_proposal_reviews(uuid) from public,anon;
grant execute on function public.kalling_execution_review_proposal(uuid,jsonb),public.kalling_execution_proposal_reviews(uuid) to authenticated;
commit;
