create function public.retire_account_for_review(p_account_id uuid) returns integer
language plpgsql security invoker set search_path='' as $$
declare v_owner uuid:=auth.uid(); v_count integer;
begin
  if v_owner is null then raise exception 'Authentication required'; end if;
  perform 1 from public.accounts where id=p_account_id and user_id=v_owner for update;
  if not found then raise exception 'Account unavailable'; end if;
  insert into public.actual_edit_proposals(user_id,original_actual_id,fields,status)
  select v_owner,a.id,jsonb_build_object(
    'date',a.occurred_on::text,'description',a.description,'kind',a.entry_kind::text,'currency',a.currency_code::text,
    'amount',case when a.currency_code='KRW' then a.original_amount_minor::text else round(a.original_amount_minor::numeric/100,2)::text end,
    'settled',case when a.settlement_currency='KRW' then a.settlement_amount_minor::text else round(a.settlement_amount_minor::numeric/100,2)::text end,
    'fee',case when a.settlement_currency='KRW' then a.explicit_fee_minor::text else round(a.explicit_fee_minor::numeric/100,2)::text end,
    'accountId','','categoryId',coalesce(a.category_id::text,''),'planId',coalesce(a.plan_id::text,''),
    'splits',coalesce((select jsonb_agg(jsonb_build_object('categoryId',s.category_id::text,'amount',case when a.currency_code='KRW' then s.original_amount_minor::text else round(s.original_amount_minor::numeric/100,2)::text end)) from public.transaction_splits s where s.user_id=v_owner and s.actual_transaction_id=a.id),'[]'::jsonb)
  ),'pending'
  from public.actual_transactions a where a.user_id=v_owner and a.account_id=p_account_id and not a.is_reversal
    and not exists(select 1 from public.actual_transactions r where r.user_id=v_owner and r.correction_of_id=a.id)
  on conflict(user_id,original_actual_id) do update set fields=excluded.fields,status='pending',updated_at=now()
    where actual_edit_proposals.status <> 'pending';
  get diagnostics v_count=row_count;
  update public.transaction_drafts set account_id=null where user_id=v_owner and account_id=p_account_id and settled_actual_id is null;
  update public.plans set account_id=null where user_id=v_owner and account_id=p_account_id;
  update public.recurring_templates set account_id=null where user_id=v_owner and account_id=p_account_id;
  update public.accounts set is_active=false where id=p_account_id and user_id=v_owner;
  return v_count;
end;
$$;
revoke all on function public.retire_account_for_review(uuid) from public,anon;
grant execute on function public.retire_account_for_review(uuid) to authenticated;
-- History and transfers keep their original account references. Retired accounts
-- remain restorable; no actual record, receipt evidence or transfer is deleted.
