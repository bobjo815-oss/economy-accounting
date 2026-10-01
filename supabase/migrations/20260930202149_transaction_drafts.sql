-- Additive: existing actuals, rates and balances are unchanged.
-- Version aligned to the hosted migration record.
create table public.statement_evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_key text not null check (length(source_key) between 1 and 200),
  occurred_on date not null,
  description text not null check (length(description) between 1 and 500),
  payment_method text not null default '',
  status text not null check (status in ('confirmed', 'approved', 'canceled')),
  original_amount_minor bigint check (original_amount_minor between 1 and 9007199254740991),
  currency_code char(3) check (currency_code in ('KRW', 'GBP', 'USD')),
  reported_krw_minor bigint check (reported_krw_minor between 0 and 9007199254740991),
  evidence jsonb not null default '{}'::jsonb check (octet_length(evidence::text) <= 65536),
  created_at timestamptz not null default now(),
  unique (user_id, source_key), unique (id, user_id),
  check ((original_amount_minor is null) = (currency_code is null))
);

create table public.transaction_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_key text not null check (length(source_key) between 1 and 200),
  occurred_on date not null,
  description text not null check (length(description) between 1 and 500),
  direction public.cash_direction not null default 'outflow',
  original_amount_minor bigint not null check (original_amount_minor between 1 and 9007199254740991),
  currency_code char(3) not null check (currency_code in ('KRW', 'GBP', 'USD')),
  payment_method text not null default '' check (length(payment_method) <= 100),
  account_id uuid,
  category_id uuid,
  reference_krw_minor bigint check (reference_krw_minor between 0 and 9007199254740991),
  statement_evidence_id uuid,
  settled_actual_id uuid,
  notes text not null default '' check (length(notes) <= 2000),
  evidence jsonb not null default '{}'::jsonb check (octet_length(evidence::text) <= 65536),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, source_key), unique (id, user_id),
  foreign key (account_id, user_id) references public.accounts(id, user_id),
  foreign key (category_id, user_id) references public.categories(id, user_id),
  foreign key (statement_evidence_id, user_id) references public.statement_evidence(id, user_id),
  foreign key (settled_actual_id, user_id) references public.actual_transactions(id, user_id)
);
create unique index drafts_one_statement_idx on public.transaction_drafts(statement_evidence_id) where statement_evidence_id is not null;
create unique index drafts_one_actual_idx on public.transaction_drafts(settled_actual_id) where settled_actual_id is not null;
create index drafts_owner_date_idx on public.transaction_drafts(user_id, occurred_on desc);
create index statement_evidence_owner_date_idx on public.statement_evidence(user_id, occurred_on desc);

create table public.transaction_draft_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  draft_id uuid not null,
  before_value jsonb,
  after_value jsonb not null,
  created_at timestamptz not null default now(),
  foreign key (draft_id, user_id) references public.transaction_drafts(id, user_id)
);
create index draft_events_owner_draft_idx on public.transaction_draft_events(user_id, draft_id, created_at);

alter table public.transaction_drafts enable row level security;
alter table public.statement_evidence enable row level security;
alter table public.transaction_draft_events enable row level security;
revoke all on public.transaction_drafts, public.statement_evidence, public.transaction_draft_events from public, anon, authenticated;
grant select, insert, update on public.transaction_drafts to authenticated;
grant select, insert on public.statement_evidence, public.transaction_draft_events to authenticated;
create policy drafts_select on public.transaction_drafts for select to authenticated using ((select auth.uid()) = user_id);
create policy drafts_insert on public.transaction_drafts for insert to authenticated with check ((select auth.uid()) = user_id);
create policy drafts_update on public.transaction_drafts for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy drafts_delete on public.transaction_drafts for delete to authenticated using ((select auth.uid()) = user_id);
create policy statement_evidence_select on public.statement_evidence for select to authenticated using ((select auth.uid()) = user_id);
create policy statement_evidence_insert on public.statement_evidence for insert to authenticated with check ((select auth.uid()) = user_id);
create policy draft_events_select on public.transaction_draft_events for select to authenticated using ((select auth.uid()) = user_id);
create policy draft_events_insert on public.transaction_draft_events for insert to authenticated with check ((select auth.uid()) = user_id);

create function public.validate_transaction_draft() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if old.user_id <> new.user_id or old.source_key <> new.source_key or old.evidence <> new.evidence then
      raise exception 'Draft source evidence is immutable';
    end if;
    if old.settled_actual_id is not null and (old.settled_actual_id is distinct from new.settled_actual_id
      or old.original_amount_minor <> new.original_amount_minor or old.currency_code <> new.currency_code
      or old.occurred_on <> new.occurred_on or old.description <> new.description
      or old.direction <> new.direction or old.account_id is distinct from new.account_id
      or old.category_id is distinct from new.category_id) then
      raise exception 'Settled facts require a linked correction';
    end if;
  end if;
  if new.statement_evidence_id is not null and not exists (
    select 1 from public.statement_evidence where id = new.statement_evidence_id and user_id = new.user_id and status = 'confirmed'
  ) then raise exception 'Only confirmed statement rows may be linked'; end if;
  if new.settled_actual_id is not null and not exists (
    select 1 from public.actual_transactions where id = new.settled_actual_id and user_id = new.user_id
      and settlement_status = 'settled' and not is_reversal and original_amount_minor = new.original_amount_minor
      and currency_code = new.currency_code and occurred_on = new.occurred_on and direction = new.direction
      and account_id = new.account_id
  ) then raise exception 'Settlement must match this draft'; end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger drafts_validate before insert or update on public.transaction_drafts for each row execute function public.validate_transaction_draft();

create function public.record_transaction_draft_event() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.transaction_draft_events(user_id, draft_id, before_value, after_value)
  values (new.user_id, new.id, case when tg_op = 'UPDATE' then to_jsonb(old) else null end, to_jsonb(new));
  return new;
end;
$$;
create trigger drafts_record_event after insert or update on public.transaction_drafts for each row execute function public.record_transaction_draft_event();

create function public.settle_transaction_draft(p_draft_id uuid, p_actual jsonb, p_splits jsonb default '[]'::jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare d public.transaction_drafts; actual_id uuid;
begin
  select * into d from public.transaction_drafts where id = p_draft_id and user_id = auth.uid() for update;
  if not found or d.archived then raise exception 'Draft unavailable'; end if;
  if d.settled_actual_id is not null then raise exception 'Draft already settled'; end if;
  if (p_actual->>'original_amount_minor')::bigint <> d.original_amount_minor
    or (p_actual->>'currency_code') <> d.currency_code or (p_actual->>'occurred_on')::date <> d.occurred_on
    or (p_actual->>'direction') <> d.direction then raise exception 'Save changed draft details first'; end if;
  actual_id := public.create_settled_actual(p_actual, p_splits);
  update public.transaction_drafts set settled_actual_id = actual_id, account_id = (p_actual->>'account_id')::uuid where id = d.id;
  return actual_id;
end;
$$;
revoke all on function public.validate_transaction_draft(), public.record_transaction_draft_event(), public.settle_transaction_draft(uuid,jsonb,jsonb) from public, anon;
grant execute on function public.validate_transaction_draft(), public.record_transaction_draft_event(), public.settle_transaction_draft(uuid,jsonb,jsonb) to authenticated;
-- Rollback: keep additive tables/functions for data preservation and roll back the UI.
-- Export drafts/evidence before any separately authorized schema removal.
