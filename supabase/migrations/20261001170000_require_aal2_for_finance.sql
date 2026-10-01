-- Require a verified second factor for every authenticated finance-table access.
-- Apply only after the owner has enrolled and tested TOTP in the deployed app;
-- otherwise AAL1 sessions (and users without a factor) lose ledger access.
-- Existing owner-scoped permissive policies remain responsible for row ownership.

create policy require_aal2 on public.profiles as restrictive
  for all to authenticated using ((select auth.jwt()->>'aal') = 'aal2')
  with check ((select auth.jwt()->>'aal') = 'aal2');
create policy require_aal2 on public.accounts as restrictive
  for all to authenticated using ((select auth.jwt()->>'aal') = 'aal2')
  with check ((select auth.jwt()->>'aal') = 'aal2');
create policy require_aal2 on public.categories as restrictive
  for all to authenticated using ((select auth.jwt()->>'aal') = 'aal2')
  with check ((select auth.jwt()->>'aal') = 'aal2');
create policy require_aal2 on public.fx_snapshots as restrictive
  for all to authenticated using ((select auth.jwt()->>'aal') = 'aal2')
  with check ((select auth.jwt()->>'aal') = 'aal2');
create policy require_aal2 on public.plans as restrictive
  for all to authenticated using ((select auth.jwt()->>'aal') = 'aal2')
  with check ((select auth.jwt()->>'aal') = 'aal2');
create policy require_aal2 on public.actual_transactions as restrictive
  for all to authenticated using ((select auth.jwt()->>'aal') = 'aal2')
  with check ((select auth.jwt()->>'aal') = 'aal2');
create policy require_aal2 on public.transaction_splits as restrictive
  for all to authenticated using ((select auth.jwt()->>'aal') = 'aal2')
  with check ((select auth.jwt()->>'aal') = 'aal2');
create policy require_aal2 on public.recurring_templates as restrictive
  for all to authenticated using ((select auth.jwt()->>'aal') = 'aal2')
  with check ((select auth.jwt()->>'aal') = 'aal2');
create policy require_aal2 on public.transfers as restrictive
  for all to authenticated using ((select auth.jwt()->>'aal') = 'aal2')
  with check ((select auth.jwt()->>'aal') = 'aal2');
create policy require_aal2 on public.ai_suggestions as restrictive
  for all to authenticated using ((select auth.jwt()->>'aal') = 'aal2')
  with check ((select auth.jwt()->>'aal') = 'aal2');
create policy require_aal2 on public.merchant_rule_events as restrictive
  for all to authenticated using ((select auth.jwt()->>'aal') = 'aal2')
  with check ((select auth.jwt()->>'aal') = 'aal2');
create policy require_aal2 on public.merchant_rules as restrictive
  for all to authenticated using ((select auth.jwt()->>'aal') = 'aal2')
  with check ((select auth.jwt()->>'aal') = 'aal2');
create policy require_aal2 on public.statement_evidence as restrictive
  for all to authenticated using ((select auth.jwt()->>'aal') = 'aal2')
  with check ((select auth.jwt()->>'aal') = 'aal2');
create policy require_aal2 on public.transaction_drafts as restrictive
  for all to authenticated using ((select auth.jwt()->>'aal') = 'aal2')
  with check ((select auth.jwt()->>'aal') = 'aal2');
create policy require_aal2 on public.transaction_draft_events as restrictive
  for all to authenticated using ((select auth.jwt()->>'aal') = 'aal2')
  with check ((select auth.jwt()->>'aal') = 'aal2');
create policy require_aal2 on public.actual_edit_proposals as restrictive
  for all to authenticated using ((select auth.jwt()->>'aal') = 'aal2')
  with check ((select auth.jwt()->>'aal') = 'aal2');
create policy require_aal2 on public.statement_debit_confirmations as restrictive
  for all to authenticated using ((select auth.jwt()->>'aal') = 'aal2')
  with check ((select auth.jwt()->>'aal') = 'aal2');
