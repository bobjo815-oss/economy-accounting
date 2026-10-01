create table public.statement_debit_confirmations (
  -- Version aligned with hosted migration history.
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  statement_evidence_id uuid not null,
  amount_krw_minor bigint not null check(amount_krw_minor between 1 and 9007199254740991),
  source_label text not null check(length(source_label) between 1 and 300),
  created_at timestamptz not null default now(),
  unique(user_id,statement_evidence_id),
  foreign key(statement_evidence_id,user_id) references public.statement_evidence(id,user_id)
);
alter table public.statement_debit_confirmations enable row level security;
revoke all on public.statement_debit_confirmations from public, anon, authenticated;
grant select,insert on public.statement_debit_confirmations to authenticated;
create policy debit_confirmation_select on public.statement_debit_confirmations for select to authenticated using((select auth.uid())=user_id);
create policy debit_confirmation_insert on public.statement_debit_confirmations for insert to authenticated with check((select auth.uid())=user_id);
create function public.validate_statement_debit_confirmation() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if not exists(select 1 from public.statement_evidence where id=new.statement_evidence_id and user_id=new.user_id and status='confirmed' and reported_krw_minor=new.amount_krw_minor) then
    raise exception 'Confirmed debit must equal the completed statement amount';
  end if;
  return new;
end;
$$;
revoke all on function public.validate_statement_debit_confirmation() from public,anon;
grant execute on function public.validate_statement_debit_confirmation() to authenticated;
create trigger debit_confirmation_validate before insert on public.statement_debit_confirmations for each row execute function public.validate_statement_debit_confirmation();
-- Rollback UI only; retain immutable confirmations and original source evidence.
