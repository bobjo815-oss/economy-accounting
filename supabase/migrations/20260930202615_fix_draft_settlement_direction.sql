create or replace function public.settle_transaction_draft(p_draft_id uuid, p_actual jsonb, p_splits jsonb default '[]'::jsonb)
-- Version aligned to the hosted migration record.
returns uuid language plpgsql security invoker set search_path = '' as $$
declare d public.transaction_drafts; actual_id uuid;
begin
  select * into d from public.transaction_drafts where id = p_draft_id and user_id = auth.uid() for update;
  if not found or d.archived then raise exception 'Draft unavailable'; end if;
  if d.settled_actual_id is not null then raise exception 'Draft already settled'; end if;
  if (p_actual->>'original_amount_minor')::bigint is distinct from d.original_amount_minor
    or (p_actual->>'currency_code') is distinct from d.currency_code::text
    or (p_actual->>'occurred_on')::date is distinct from d.occurred_on
    or (p_actual->>'direction') is distinct from d.direction::text
    or (p_actual->>'description') is distinct from d.description
    then raise exception 'Save changed draft details first'; end if;
  actual_id := public.create_settled_actual(p_actual, p_splits);
  update public.transaction_drafts set settled_actual_id = actual_id, account_id = (p_actual->>'account_id')::uuid where id = d.id;
  return actual_id;
end;
$$;
