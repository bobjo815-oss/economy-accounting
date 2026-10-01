-- Expand the allowed currency codes using the current ISO 4217 list with
-- numeric minor-unit precision. Keep this in sync with src/lib/finance/money.ts.
create or replace function public.is_supported_currency(p_currency text)
returns boolean
language sql immutable security invoker set search_path = '' as $$
  select p_currency = any (array[
    'AED','AFN','ALL','AMD','ANG','AOA','ARS','AUD','AWG','AZN','BAM','BBD','BDT','BHD','BIF','BMD','BND','BOB','BOV','BRL',
    'BSD','BTN','BWP','BYN','BZD','CAD','CDF','CHE','CHF','CHW','CLF','CLP','CNY','COP','COU','CRC','CUP','CVE','CZK','DJF',
    'DKK','DOP','DZD','EGP','ERN','ETB','EUR','FJD','FKP','GBP','GEL','GHS','GIP','GMD','GNF','GTQ','GYD','HKD','HNL','HTG',
    'HUF','IDR','ILS','INR','IQD','IRR','ISK','JMD','JOD','JPY','KES','KGS','KHR','KMF','KPW','KRW','KWD','KYD','KZT','LAK',
    'LBP','LKR','LRD','LSL','LYD','MAD','MDL','MGA','MKD','MMK','MNT','MOP','MRU','MUR','MVR','MWK','MXN','MXV','MYR','MZN',
    'NAD','NGN','NIO','NOK','NPR','NZD','OMR','PAB','PEN','PGK','PHP','PKR','PLN','PYG','QAR','RON','RSD','RUB','RWF','SAR',
    'SBD','SCR','SDG','SEK','SGD','SHP','SLE','SOS','SRD','SSP','STN','SVC','SYP','SZL','THB','TJS','TMT','TND','TOP','TRY',
    'TTD','TWD','TZS','UAH','UGX','USD','USN','UYU','UYI','UYW','UZS','VED','VES','VND','VUV','WST','XAD','XAF','XCD','XCG',
    'XOF','XPF','YER','ZAR','ZMW','ZWG'
  ]::text[])
$$;

create or replace function public.currency_minor_digits(p_currency text)
returns integer
language sql immutable security invoker set search_path = '' as $$
  select case
    when p_currency in ('BIF','CLP','DJF','GNF','ISK','JPY','KMF','KRW','PYG','RWF','UGX','UYI','VND','VUV','XAF','XOF','XPF') then 0
    when p_currency in ('BHD','IQD','JOD','KWD','LYD','OMR','TND') then 3
    when p_currency in ('CLF','UYW') then 4
    else 2
  end
$$;

alter table public.profiles drop constraint profiles_base_currency_check;
alter table public.profiles add constraint profiles_base_currency_check check (public.is_supported_currency(base_currency::text));
alter table public.accounts drop constraint accounts_currency_code_check;
alter table public.accounts add constraint accounts_currency_code_check check (public.is_supported_currency(currency_code::text));
alter table public.fx_snapshots drop constraint fx_snapshots_from_currency_check;
alter table public.fx_snapshots drop constraint fx_snapshots_to_currency_check;
alter table public.fx_snapshots add constraint fx_snapshots_from_currency_check check (public.is_supported_currency(from_currency::text));
alter table public.fx_snapshots add constraint fx_snapshots_to_currency_check check (public.is_supported_currency(to_currency::text));
alter table public.plans drop constraint plans_currency_code_check;
alter table public.plans drop constraint plans_base_currency_check;
alter table public.plans add constraint plans_currency_code_check check (public.is_supported_currency(currency_code::text));
alter table public.plans add constraint plans_base_currency_check check (public.is_supported_currency(base_currency::text));
alter table public.actual_transactions drop constraint actual_transactions_currency_code_check;
alter table public.actual_transactions drop constraint actual_transactions_settlement_currency_check;
alter table public.actual_transactions add constraint actual_transactions_currency_code_check check (public.is_supported_currency(currency_code::text));
alter table public.actual_transactions add constraint actual_transactions_settlement_currency_check check (public.is_supported_currency(settlement_currency::text));
alter table public.recurring_templates drop constraint recurring_templates_currency_code_check;
alter table public.recurring_templates add constraint recurring_templates_currency_code_check check (public.is_supported_currency(currency_code::text));
alter table public.statement_evidence drop constraint statement_evidence_currency_code_check;
alter table public.statement_evidence add constraint statement_evidence_currency_code_check check (currency_code is null or public.is_supported_currency(currency_code::text));
alter table public.transaction_drafts drop constraint transaction_drafts_currency_code_check;
alter table public.transaction_drafts add constraint transaction_drafts_currency_code_check check (public.is_supported_currency(currency_code::text));

-- Keep review proposals editable for every currency's real decimal precision.
create or replace function public.retire_account_for_review(p_account_id uuid) returns integer
language plpgsql security invoker set search_path='' as $$
declare v_owner uuid:=auth.uid(); v_count integer;
begin
  if v_owner is null then raise exception 'Authentication required'; end if;
  perform 1 from public.accounts where id=p_account_id and user_id=v_owner for update;
  if not found then raise exception 'Account unavailable'; end if;
  insert into public.actual_edit_proposals(user_id,original_actual_id,fields,status)
  select v_owner,a.id,jsonb_build_object(
    'date',a.occurred_on::text,'description',a.description,'kind',a.entry_kind::text,'currency',a.currency_code::text,
    'amount',round(a.original_amount_minor::numeric/power(10::numeric,public.currency_minor_digits(a.currency_code::text)::numeric),public.currency_minor_digits(a.currency_code::text))::text,
    'settled',round(a.settlement_amount_minor::numeric/power(10::numeric,public.currency_minor_digits(a.settlement_currency::text)::numeric),public.currency_minor_digits(a.settlement_currency::text))::text,
    'fee',round(a.explicit_fee_minor::numeric/power(10::numeric,public.currency_minor_digits(a.settlement_currency::text)::numeric),public.currency_minor_digits(a.settlement_currency::text))::text,
    'accountId','','categoryId',coalesce(a.category_id::text,''),'planId',coalesce(a.plan_id::text,''),
    'splits',coalesce((select jsonb_agg(jsonb_build_object('categoryId',s.category_id::text,'amount',round(s.original_amount_minor::numeric/power(10::numeric,public.currency_minor_digits(a.currency_code::text)::numeric),public.currency_minor_digits(a.currency_code::text))::text)) from public.transaction_splits s where s.user_id=v_owner and s.actual_transaction_id=a.id),'[]'::jsonb)
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
