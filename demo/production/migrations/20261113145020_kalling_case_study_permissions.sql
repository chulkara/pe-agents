begin;
create function public.kalling_execution_case(p_transaction uuid,p_revision integer,p_action text,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
 declare t kalling_private.execution_transactions;r text;d jsonb;c jsonb;n jsonb;items jsonb;begin
 select * into t from kalling_private.execution_transactions where id=p_transaction for update;r=kalling_private.execution_role(t.id);if r is null or r='viewer' or t.state<>'Closed' then raise exception 'Publicity access denied' using errcode='42501';end if;if t.revision<>p_revision then raise exception 'This transaction changed. Reload before saving.';end if;d=t.data;c=d->'cases'->-1;
 if p_action='case_draft' then
 if r<>'advisor' or not kalling_private.execution_safe(p->>'title',5,160) or not kalling_private.execution_safe(p->>'body',40,6000) or not kalling_private.execution_safe(p->>'rights',20,2000) or jsonb_typeof(p->'fields') is distinct from 'array' or jsonb_typeof(p->'channels') is distinct from 'array' or jsonb_array_length(p->'channels')=0 or exists(select 1 from jsonb_array_elements_text(p->'channels') x where x not in ('Website','Email')) or exists(select 1 from jsonb_array_elements_text(p->'fields') x where x not in ('Business name','Owner name','Fixed consideration','Contingent consideration','Text only','Quote')) then raise exception 'Specify exact copy, fields, channels and separately confirmed third-party rights.';end if;
 select coalesce(jsonb_agg(case when x->>'status' in ('Approved','Published') then (x-'delivery')||jsonb_build_object('status','Withdrawn') else x end),'[]') into items from jsonb_array_elements(d->'cases') x;
 n=jsonb_build_object('version',coalesce((c->>'version')::integer,0)+1,'title',p->>'title','body',p->>'body','fields',p->'fields','channels',p->'channels','rights',p->>'rights','status','Draft','createdAt',now(),'createdBy',kalling_private.actor_name());d=jsonb_set(d,'{cases}',items||jsonb_build_array(n));
 else
 if c is null or (p->>'version')::integer is distinct from (c->>'version')::integer then raise exception 'Open the exact current case-study version.';end if;
 if p_action='case_decide' then
 if r<>'seller' or coalesce(p->>'decision','') not in ('Approved','Declined','Changes requested','Withdrawn') or not kalling_private.execution_safe(p->>'note',5,2000) then raise exception 'Only the authenticated seller can decide exact publicity permission.';end if;
 n=(c-'delivery')||jsonb_build_object('status',p->>'decision','decision',jsonb_build_object('by','Seller (authenticated)','at',now(),'note',p->>'note'));
 elsif p_action='case_publish' then
 if r<>'advisor' or c->>'status'<>'Approved' or c->'decision' is null or not (c->'channels' ? 'Website') then raise exception 'Obtain current seller permission for this exact website version.';end if;n=c||jsonb_build_object('status','Published','publishedAt',now());
 elsif p_action='case_email' then
 if r<>'advisor' or not coalesce((p->>'reviewed')::boolean,false) or c->>'status' not in ('Approved','Published') or c->'decision' is null or not (c->'channels' ? 'Email') or p->>'recipient'!~'^[^[:space:]@]+@[^[:space:]@]+[.]invalid$' then raise exception 'Review the exact approved version, channel and fictional .invalid email recipient.';end if;
 n=c||jsonb_build_object('delivery',jsonb_build_object('recipient',p->>'recipient','version',c->'version','approvedBy',kalling_private.actor_name(),'status','Simulated'));
 else raise exception 'Unknown publicity action';end if;
 d=jsonb_set(d,array['cases',(jsonb_array_length(d->'cases')-1)::text],n);end if;
 perform kalling_private.execution_save(t,d,p_action,case when p_action='case_email' then 'Simulated; no email was sent or delivered.' when p_action='case_decide' then 'Seller decision: '||(p->>'decision')||'. Service is unchanged.' else 'Exact case-study version recorded.' end);return kalling_private.execution_projection(t.id);end $$;
create function public.kalling_public_cases() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'listingNumber',l.number,'version',c->'version','title',c->>'title','body',c->>'body','publishedAt',c->>'publishedAt')),'[]') from kalling_private.execution_transactions t join public.kalling_listings l on l.id=t.listing_id cross join lateral(select t.data->'cases'->-1 c) x where t.state='Closed' and l.status='Sold' and c->>'status'='Published' and c->'decision' is not null and c->'channels' ? 'Website'
$$;
revoke all on function public.kalling_execution_case(uuid,integer,text,jsonb),public.kalling_public_cases() from public,anon;
grant execute on function public.kalling_execution_case(uuid,integer,text,jsonb) to authenticated;
grant execute on function public.kalling_public_cases() to anon,authenticated;
commit;

