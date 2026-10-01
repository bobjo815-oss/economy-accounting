-- Serialize corrections without granting UPDATE access to append-only actuals.
create or replace function public.correct_settled_actual(p_original_id uuid, p_actual jsonb, p_splits jsonb default '[]'::jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_owner uuid := auth.uid(); v_original public.actual_transactions;
  v_reversal uuid; v_replacement uuid; v_split jsonb; v_total bigint := 0;
begin
  if v_owner is null then raise exception 'Authentication required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_original_id::text,0));
  select * into v_original from public.actual_transactions
    where id = p_original_id and user_id = v_owner and not is_reversal and settlement_status = 'settled';
  if not found then raise exception 'Settlement unavailable'; end if;
  if exists (select 1 from public.actual_transactions where user_id = v_owner and correction_of_id = p_original_id) then
    raise exception 'Settlement already corrected';
  end if;
  if jsonb_typeof(p_actual) is distinct from 'object' or jsonb_typeof(p_splits) is distinct from 'array' then raise exception 'Invalid correction'; end if;
  if not exists (select 1 from public.accounts where user_id=v_owner and id=(p_actual->>'account_id')::uuid and is_active and currency_code=p_actual->>'settlement_currency') then
    raise exception 'Active owned payment account required';
  end if;
  if jsonb_array_length(p_splits) > 0 and nullif(p_actual->>'category_id','') is not null then raise exception 'Split category conflict'; end if;

  -- Same transaction date cancels the old amount in its original reporting period.
  insert into public.actual_transactions(user_id,plan_id,account_id,category_id,occurred_on,description,direction,entry_kind,
    original_amount_minor,currency_code,settlement_amount_minor,settlement_currency,explicit_fee_minor,settlement_fx_snapshot_id,
    settlement_status,is_reversal,correction_of_id)
  values(v_owner,v_original.plan_id,v_original.account_id,v_original.category_id,v_original.occurred_on,v_original.description,
    v_original.direction,v_original.entry_kind,v_original.original_amount_minor,v_original.currency_code,v_original.settlement_amount_minor,
    v_original.settlement_currency,v_original.explicit_fee_minor,v_original.settlement_fx_snapshot_id,'settled',true,p_original_id)
  returning id into v_reversal;
  insert into public.transaction_splits(user_id,actual_transaction_id,category_id,original_amount_minor)
    select v_owner,v_reversal,category_id,original_amount_minor from public.transaction_splits where user_id=v_owner and actual_transaction_id=p_original_id;

  insert into public.actual_transactions(user_id,plan_id,account_id,category_id,occurred_on,description,direction,entry_kind,
    original_amount_minor,currency_code,settlement_amount_minor,settlement_currency,explicit_fee_minor,settlement_fx_snapshot_id,
    settlement_status,is_reversal,replacement_of_id)
  values(v_owner,nullif(p_actual->>'plan_id','')::uuid,(p_actual->>'account_id')::uuid,nullif(p_actual->>'category_id','')::uuid,
    (p_actual->>'occurred_on')::date,p_actual->>'description',(p_actual->>'direction')::public.cash_direction,(p_actual->>'entry_kind')::public.entry_kind,
    (p_actual->>'original_amount_minor')::bigint,(p_actual->>'currency_code')::char(3),(p_actual->>'settlement_amount_minor')::bigint,
    (p_actual->>'settlement_currency')::char(3),(p_actual->>'explicit_fee_minor')::bigint,nullif(p_actual->>'settlement_fx_snapshot_id','')::uuid,
    'settled',false,p_original_id) returning id into v_replacement;
  for v_split in select value from jsonb_array_elements(p_splits) loop
    if nullif(v_split->>'category_id','') is null then raise exception 'Split category required'; end if;
    v_total := v_total + (v_split->>'original_amount_minor')::bigint;
    insert into public.transaction_splits(user_id,actual_transaction_id,category_id,original_amount_minor)
      values(v_owner,v_replacement,(v_split->>'category_id')::uuid,(v_split->>'original_amount_minor')::bigint);
  end loop;
  if jsonb_array_length(p_splits) > 0 and v_total <> (p_actual->>'original_amount_minor')::bigint then raise exception 'Split total mismatch'; end if;
  return v_replacement;
end;
$$;
revoke all on function public.correct_settled_actual(uuid,jsonb,jsonb) from public, anon;
grant execute on function public.correct_settled_actual(uuid,jsonb,jsonb) to authenticated;
