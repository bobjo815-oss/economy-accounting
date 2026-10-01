create table public.actual_edit_proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  original_actual_id uuid not null,
  fields jsonb not null check (jsonb_typeof(fields)='object' and octet_length(fields::text)<=65536),
  status text not null default 'pending' check(status in ('pending','resolved','discarded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,original_actual_id),
  foreign key(original_actual_id,user_id) references public.actual_transactions(id,user_id)
);
alter table public.actual_edit_proposals enable row level security;
revoke all on public.actual_edit_proposals from public,anon,authenticated;
grant select,insert,update on public.actual_edit_proposals to authenticated;
create policy proposals_select on public.actual_edit_proposals for select to authenticated using((select auth.uid())=user_id);
create policy proposals_insert on public.actual_edit_proposals for insert to authenticated with check((select auth.uid())=user_id);
create policy proposals_update on public.actual_edit_proposals for update to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy proposals_delete on public.actual_edit_proposals for delete to authenticated using((select auth.uid())=user_id);
create function public.resolve_actual_edit_proposal() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.replacement_of_id is not null then
    update public.actual_edit_proposals set status='resolved',updated_at=now()
      where user_id=new.user_id and original_actual_id=new.replacement_of_id and status='pending';
  end if;
  return new;
end;
$$;
revoke all on function public.resolve_actual_edit_proposal() from public,anon;
grant execute on function public.resolve_actual_edit_proposal() to authenticated;
create trigger actuals_resolve_proposal after insert on public.actual_transactions for each row execute function public.resolve_actual_edit_proposal();
-- Rollback: revert the UI; retain proposals and all correction history.
