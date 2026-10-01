-- Reject inconsistent historical links instead of rewriting financial evidence.
-- The migration filename matches the version recorded in the hosted database.
do $$
begin
  if exists (
    select 1 from public.plans p
    where p.baseline_fx_snapshot_id is not null and not exists (
      select 1 from public.fx_snapshots x
      where x.id = p.baseline_fx_snapshot_id and x.user_id = p.user_id
        and x.from_currency = p.currency_code and x.to_currency = p.base_currency
        and x.purpose = 'baseline_plan'
    )
  ) or exists (
    select 1 from public.plans p
    where p.forecast_fx_snapshot_id is not null and not exists (
      select 1 from public.fx_snapshots x
      where x.id = p.forecast_fx_snapshot_id and x.user_id = p.user_id
        and x.from_currency = p.currency_code and x.to_currency = p.base_currency
        and x.purpose = 'forecast'
    )
  ) or exists (
    select 1 from public.actual_transactions a
    where a.settlement_fx_snapshot_id is not null and not exists (
      select 1 from public.fx_snapshots x
      where x.id = a.settlement_fx_snapshot_id and x.user_id = a.user_id
        and x.from_currency = a.currency_code and x.to_currency = a.settlement_currency
        and x.purpose = 'actual_settlement'
    )
  ) then
    raise exception 'Existing FX snapshot links need review before this migration';
  end if;
end;
$$;

create function public.validate_plan_fx_links()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.baseline_fx_snapshot_id is not null and not exists (
    select 1 from public.fx_snapshots x
    where x.id = new.baseline_fx_snapshot_id and x.user_id = new.user_id
      and x.from_currency = new.currency_code and x.to_currency = new.base_currency
      and x.purpose = 'baseline_plan'
  ) then
    raise exception 'Plan baseline FX snapshot does not match its currencies and purpose';
  end if;
  if new.forecast_fx_snapshot_id is not null and not exists (
    select 1 from public.fx_snapshots x
    where x.id = new.forecast_fx_snapshot_id and x.user_id = new.user_id
      and x.from_currency = new.currency_code and x.to_currency = new.base_currency
      and x.purpose = 'forecast'
  ) then
    raise exception 'Plan forecast FX snapshot does not match its currencies and purpose';
  end if;
  return new;
end;
$$;

create trigger plans_validate_fx_links before insert or update on public.plans
for each row execute function public.validate_plan_fx_links();

create function public.validate_actual_fx_link()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.settlement_fx_snapshot_id is not null and not exists (
    select 1 from public.fx_snapshots x
    where x.id = new.settlement_fx_snapshot_id and x.user_id = new.user_id
      and x.from_currency = new.currency_code and x.to_currency = new.settlement_currency
      and x.purpose = 'actual_settlement'
  ) then
    raise exception 'Actual settlement FX snapshot does not match its currencies and purpose';
  end if;
  return new;
end;
$$;

create trigger actuals_validate_fx_link before insert or update on public.actual_transactions
for each row execute function public.validate_actual_fx_link();

-- Rollback: drop both triggers, then public.validate_plan_fx_links() and
-- public.validate_actual_fx_link(). No existing rows are modified.
