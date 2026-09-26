create extension if not exists pgcrypto;

create type public.cash_direction as enum ('inflow', 'outflow');
create type public.plan_status as enum ('draft', 'pending', 'partial', 'completed', 'overdue', 'canceled');
create type public.settlement_status as enum ('pending_settlement', 'settled', 'voided');
create type public.entry_kind as enum ('expense', 'income', 'transfer', 'loan_drawdown', 'loan_principal', 'loan_interest');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  base_currency char(3) not null default 'KRW',
  timezone text not null default 'Europe/London',
  safety_balance_minor bigint not null default 0 check (safety_balance_minor between 0 and 9007199254740991),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (base_currency in ('KRW', 'GBP', 'USD'))
);

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  currency_code char(3) not null,
  opening_balance_minor bigint not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name),
  unique (id, user_id),
  unique (id, user_id, currency_code),
  check (currency_code in ('KRW', 'GBP', 'USD'))
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  major_name text not null,
  name text not null,
  normal_direction public.cash_direction not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, major_name, name),
  unique (id, user_id)
);

create table public.fx_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  from_currency char(3) not null,
  to_currency char(3) not null,
  rate numeric(20, 8) not null check (rate > 0),
  observed_on date not null,
  purpose text not null check (purpose in ('baseline_plan', 'forecast', 'actual_settlement', 'transfer')),
  source_label text not null default 'Manual entry',
  created_at timestamptz not null default now(),
  check (from_currency in ('KRW', 'GBP', 'USD')),
  check (to_currency in ('KRW', 'GBP', 'USD')),
  check (from_currency <> to_currency),
  unique (id, user_id)
);

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  scheduled_date date not null,
  direction public.cash_direction not null,
  entry_kind public.entry_kind not null default 'expense',
  category_id uuid,
  account_id uuid,
  original_amount_minor bigint not null check (original_amount_minor between 1 and 9007199254740991),
  currency_code char(3) not null,
  base_currency char(3) not null,
  baseline_fx_snapshot_id uuid,
  forecast_fx_snapshot_id uuid,
  baseline_fee_minor bigint not null default 0 check (baseline_fee_minor between 0 and 9007199254740991),
  forecast_fee_minor bigint not null default 0 check (forecast_fee_minor between 0 and 9007199254740991),
  status public.plan_status not null default 'draft',
  recurring_template_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (currency_code in ('KRW', 'GBP', 'USD')),
  check (base_currency in ('KRW', 'GBP', 'USD')),
  check ((entry_kind in ('income', 'loan_drawdown') and direction = 'inflow')
    or (entry_kind in ('expense', 'loan_principal', 'loan_interest') and direction = 'outflow')),
  check ((currency_code = base_currency and baseline_fx_snapshot_id is null and forecast_fx_snapshot_id is null)
    or (currency_code <> base_currency and baseline_fx_snapshot_id is not null and forecast_fx_snapshot_id is not null)),
  unique (id, user_id),
  foreign key (category_id, user_id) references public.categories(id, user_id) on delete restrict,
  foreign key (account_id, user_id) references public.accounts(id, user_id) on delete restrict,
  foreign key (baseline_fx_snapshot_id, user_id) references public.fx_snapshots(id, user_id) on delete restrict,
  foreign key (forecast_fx_snapshot_id, user_id) references public.fx_snapshots(id, user_id) on delete restrict
);

create table public.actual_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid,
  account_id uuid,
  category_id uuid,
  occurred_on date not null,
  description text not null check (char_length(description) between 1 and 500),
  direction public.cash_direction not null,
  entry_kind public.entry_kind not null default 'expense',
  original_amount_minor bigint not null check (original_amount_minor between 1 and 9007199254740991),
  currency_code char(3) not null,
  settlement_amount_minor bigint not null check (settlement_amount_minor between 1 and 9007199254740991),
  settlement_currency char(3) not null,
  explicit_fee_minor bigint not null default 0 check (explicit_fee_minor between 0 and 9007199254740991),
  settlement_fx_snapshot_id uuid,
  settlement_status public.settlement_status not null default 'settled',
  is_reversal boolean not null default false,
  correction_of_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (currency_code in ('KRW', 'GBP', 'USD')),
  check (settlement_currency in ('KRW', 'GBP', 'USD')),
  check ((entry_kind in ('income', 'loan_drawdown') and direction = 'inflow')
    or (entry_kind in ('expense', 'loan_principal', 'loan_interest') and direction = 'outflow')),
  check (is_reversal = (correction_of_id is not null)),
  check (direction <> 'inflow' or explicit_fee_minor <= settlement_amount_minor),
  unique (id, user_id),
  foreign key (plan_id, user_id) references public.plans(id, user_id) on delete restrict,
  foreign key (account_id, user_id, settlement_currency) references public.accounts(id, user_id, currency_code) on delete restrict,
  foreign key (category_id, user_id) references public.categories(id, user_id) on delete restrict,
  foreign key (settlement_fx_snapshot_id, user_id) references public.fx_snapshots(id, user_id) on delete restrict,
  foreign key (correction_of_id, user_id) references public.actual_transactions(id, user_id) on delete restrict
);

create unique index actuals_one_reversal_idx on public.actual_transactions(correction_of_id)
  where correction_of_id is not null;

create table public.transaction_splits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  actual_transaction_id uuid not null,
  category_id uuid not null,
  original_amount_minor bigint not null check (original_amount_minor between 1 and 9007199254740991),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (actual_transaction_id, user_id) references public.actual_transactions(id, user_id) on delete restrict,
  foreign key (category_id, user_id) references public.categories(id, user_id) on delete restrict
);

create table public.recurring_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  cadence text not null check (cadence in ('weekly', 'monthly', 'yearly')),
  next_date date not null,
  anchor_month smallint not null check (anchor_month between 1 and 12),
  anchor_day smallint not null check (anchor_day between 1 and 31),
  direction public.cash_direction not null,
  entry_kind public.entry_kind not null,
  category_id uuid,
  account_id uuid,
  original_amount_minor bigint not null check (original_amount_minor between 1 and 9007199254740991),
  currency_code char(3) not null check (currency_code in ('KRW', 'GBP', 'USD')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  check ((entry_kind in ('income', 'loan_drawdown') and direction = 'inflow')
    or (entry_kind in ('expense', 'loan_principal', 'loan_interest') and direction = 'outflow')),
  foreign key (category_id, user_id) references public.categories(id, user_id) on delete restrict,
  foreign key (account_id, user_id) references public.accounts(id, user_id) on delete restrict
);

alter table public.plans add constraint plans_recurring_template_owner_fk
  foreign key (recurring_template_id, user_id) references public.recurring_templates(id, user_id) on delete restrict;
create unique index plans_one_recurring_occurrence_idx on public.plans(recurring_template_id, scheduled_date)
  where recurring_template_id is not null;

create table public.transfers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  occurred_on date not null,
  description text not null check (char_length(description) between 1 and 500),
  from_account_id uuid not null,
  to_account_id uuid not null,
  from_amount_minor bigint not null check (from_amount_minor between 1 and 9007199254740991),
  to_amount_minor bigint not null check (to_amount_minor between 1 and 9007199254740991),
  explicit_fee_minor bigint not null default 0 check (explicit_fee_minor between 0 and 9007199254740991),
  transfer_fx_snapshot_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (from_account_id <> to_account_id),
  unique (id, user_id),
  foreign key (from_account_id, user_id) references public.accounts(id, user_id) on delete restrict,
  foreign key (to_account_id, user_id) references public.accounts(id, user_id) on delete restrict,
  foreign key (transfer_fx_snapshot_id, user_id) references public.fx_snapshots(id, user_id) on delete restrict
);

create table public.ai_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  input_fingerprint text not null,
  provider text not null,
  model text not null,
  prompt_version text not null,
  category_id uuid,
  confidence numeric(5, 4) not null check (confidence between 0 and 1),
  outcome text not null check (outcome in ('suggested', 'accepted', 'overridden', 'dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (category_id, user_id) references public.categories(id, user_id) on delete restrict
);

create table public.merchant_rule_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  normalized_pattern text not null,
  category_id uuid not null,
  actual_transaction_id uuid not null,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (category_id, user_id) references public.categories(id, user_id) on delete restrict,
  foreign key (actual_transaction_id, user_id) references public.actual_transactions(id, user_id) on delete restrict
);

create table public.merchant_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  normalized_pattern text not null check (char_length(normalized_pattern) between 1 and 200),
  category_id uuid not null,
  priority smallint not null default 100 check (priority between 1 and 1000),
  usage_count integer not null default 0 check (usage_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, normalized_pattern),
  foreign key (category_id, user_id) references public.categories(id, user_id) on delete restrict
);

create index accounts_owner_idx on public.accounts(user_id);
create index categories_owner_idx on public.categories(user_id);
create index fx_snapshots_owner_date_idx on public.fx_snapshots(user_id, observed_on desc);
create index plans_owner_due_idx on public.plans(user_id, scheduled_date);
create index actuals_owner_date_idx on public.actual_transactions(user_id, occurred_on desc);
create index splits_owner_actual_idx on public.transaction_splits(user_id, actual_transaction_id);
create index recurring_owner_next_idx on public.recurring_templates(user_id, next_date);
create index transfers_owner_date_idx on public.transfers(user_id, occurred_on desc);
create index ai_suggestions_owner_idx on public.ai_suggestions(user_id, created_at desc);
create index merchant_rule_events_owner_idx on public.merchant_rule_events(user_id, created_at desc);
create index merchant_rules_owner_pattern_idx on public.merchant_rules(user_id, normalized_pattern);

alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.fx_snapshots enable row level security;
alter table public.plans enable row level security;
alter table public.actual_transactions enable row level security;
alter table public.transaction_splits enable row level security;
alter table public.recurring_templates enable row level security;
alter table public.transfers enable row level security;
alter table public.ai_suggestions enable row level security;
alter table public.merchant_rule_events enable row level security;
alter table public.merchant_rules enable row level security;

revoke all on public.profiles, public.accounts, public.categories, public.fx_snapshots,
  public.plans, public.actual_transactions, public.transaction_splits, public.recurring_templates,
  public.transfers, public.ai_suggestions, public.merchant_rule_events, public.merchant_rules from anon;
grant select, insert, update, delete on public.profiles, public.accounts, public.categories,
  public.plans, public.recurring_templates, public.merchant_rules to authenticated;
grant select, insert on public.fx_snapshots, public.actual_transactions, public.transaction_splits,
  public.transfers, public.ai_suggestions, public.merchant_rule_events to authenticated;

create policy "profiles_owner" on public.profiles for all to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "accounts_owner" on public.accounts for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "categories_owner" on public.categories for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "fx_snapshots_owner_select" on public.fx_snapshots for select to authenticated using ((select auth.uid()) = user_id);
create policy "fx_snapshots_owner_insert" on public.fx_snapshots for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "plans_owner" on public.plans for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "actuals_owner_select" on public.actual_transactions for select to authenticated using ((select auth.uid()) = user_id);
create policy "actuals_owner_insert" on public.actual_transactions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "splits_owner_select" on public.transaction_splits for select to authenticated using ((select auth.uid()) = user_id);
create policy "splits_owner_insert" on public.transaction_splits for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "recurring_owner" on public.recurring_templates for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "transfers_owner_select" on public.transfers for select to authenticated using ((select auth.uid()) = user_id);
create policy "transfers_owner_insert" on public.transfers for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "ai_suggestions_owner_select" on public.ai_suggestions for select to authenticated using ((select auth.uid()) = user_id);
create policy "ai_suggestions_owner_insert" on public.ai_suggestions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "merchant_rule_events_owner_select" on public.merchant_rule_events for select to authenticated using ((select auth.uid()) = user_id);
create policy "merchant_rule_events_owner_insert" on public.merchant_rule_events for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "merchant_rules_owner" on public.merchant_rules for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create function public.prevent_plan_baseline_change()
returns trigger language plpgsql security invoker as $$
begin
  if old.original_amount_minor is distinct from new.original_amount_minor
    or old.currency_code is distinct from new.currency_code
    or old.base_currency is distinct from new.base_currency
    or old.baseline_fx_snapshot_id is distinct from new.baseline_fx_snapshot_id
    or old.baseline_fee_minor is distinct from new.baseline_fee_minor then
    raise exception 'Plan baseline is immutable';
  end if;
  return new;
end;
$$;

create trigger plans_preserve_baseline before update on public.plans
for each row execute function public.prevent_plan_baseline_change();

create function public.validate_transfer_legs()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  v_from char(3);
  v_to char(3);
begin
  select currency_code into v_from from public.accounts where id = new.from_account_id and user_id = new.user_id;
  select currency_code into v_to from public.accounts where id = new.to_account_id and user_id = new.user_id;
  if v_from is null or v_to is null then raise exception 'Transfer accounts must belong to the owner'; end if;
  if v_from = v_to and new.from_amount_minor <> new.to_amount_minor then
    raise exception 'Same-currency transfer principal must balance';
  end if;
  if new.transfer_fx_snapshot_id is not null and not exists (
    select 1 from public.fx_snapshots where id = new.transfer_fx_snapshot_id and user_id = new.user_id
      and from_currency = v_from and to_currency = v_to and purpose = 'transfer'
  ) then raise exception 'Transfer FX snapshot does not match the account currencies'; end if;
  return new;
end;
$$;

create trigger transfers_validate_legs before insert on public.transfers
for each row execute function public.validate_transfer_legs();

create function public.create_settled_actual(p_actual jsonb, p_splits jsonb default '[]'::jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_owner uuid := auth.uid();
  v_id uuid;
  v_split jsonb;
  v_split_total bigint := 0;
begin
  if v_owner is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(p_splits) <> 'array' then raise exception 'Splits must be an array'; end if;
  if jsonb_array_length(p_splits) > 0 and nullif(p_actual->>'category_id', '') is not null then
    raise exception 'A split transaction cannot also have a single category';
  end if;

  insert into public.actual_transactions (
    user_id, plan_id, account_id, category_id, occurred_on, description, direction,
    entry_kind, original_amount_minor, currency_code, settlement_amount_minor,
    settlement_currency, explicit_fee_minor, settlement_fx_snapshot_id,
    settlement_status, is_reversal
  ) values (
    v_owner, nullif(p_actual->>'plan_id', '')::uuid, (p_actual->>'account_id')::uuid,
    nullif(p_actual->>'category_id', '')::uuid, (p_actual->>'occurred_on')::date,
    p_actual->>'description', (p_actual->>'direction')::public.cash_direction,
    (p_actual->>'entry_kind')::public.entry_kind, (p_actual->>'original_amount_minor')::bigint,
    (p_actual->>'currency_code')::char(3), (p_actual->>'settlement_amount_minor')::bigint,
    (p_actual->>'settlement_currency')::char(3), (p_actual->>'explicit_fee_minor')::bigint,
    nullif(p_actual->>'settlement_fx_snapshot_id', '')::uuid, 'settled', false
  ) returning id into v_id;

  for v_split in select value from jsonb_array_elements(p_splits) loop
    if nullif(v_split->>'category_id', '') is null then raise exception 'Split category is required'; end if;
    v_split_total := v_split_total + (v_split->>'original_amount_minor')::bigint;
    insert into public.transaction_splits (user_id, actual_transaction_id, category_id, original_amount_minor)
    values (v_owner, v_id, (v_split->>'category_id')::uuid, (v_split->>'original_amount_minor')::bigint);
  end loop;
  if jsonb_array_length(p_splits) > 0 and v_split_total <> (p_actual->>'original_amount_minor')::bigint then
    raise exception 'Split amounts must equal the original amount';
  end if;
  return v_id;
end;
$$;

revoke all on function public.create_settled_actual(jsonb, jsonb) from public;
grant execute on function public.create_settled_actual(jsonb, jsonb) to authenticated;

create function public.reverse_actual(p_original_id uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_owner uuid := auth.uid();
  v_original public.actual_transactions%rowtype;
  v_reversal_id uuid;
begin
  if v_owner is null then raise exception 'Authentication required'; end if;
  select * into v_original from public.actual_transactions
    where id = p_original_id and user_id = v_owner and is_reversal = false;
  if not found then raise exception 'Original settlement not found'; end if;

  insert into public.actual_transactions (
    user_id, plan_id, account_id, category_id, occurred_on, description, direction,
    entry_kind, original_amount_minor, currency_code, settlement_amount_minor,
    settlement_currency, explicit_fee_minor, settlement_fx_snapshot_id,
    settlement_status, is_reversal, correction_of_id
  ) values (
    v_owner, v_original.plan_id, v_original.account_id, v_original.category_id, current_date,
    v_original.description, v_original.direction, v_original.entry_kind,
    v_original.original_amount_minor, v_original.currency_code,
    v_original.settlement_amount_minor, v_original.settlement_currency,
    v_original.explicit_fee_minor, v_original.settlement_fx_snapshot_id,
    'settled', true, p_original_id
  ) returning id into v_reversal_id;

  insert into public.transaction_splits (user_id, actual_transaction_id, category_id, original_amount_minor)
  select v_owner, v_reversal_id, category_id, original_amount_minor
  from public.transaction_splits where actual_transaction_id = p_original_id and user_id = v_owner;
  return v_reversal_id;
end;
$$;

revoke all on function public.reverse_actual(uuid) from public;
grant execute on function public.reverse_actual(uuid) to authenticated;
