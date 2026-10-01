# Study Finance Tracker Web

## Local setup

1. Install dependencies with `pnpm install --frozen-lockfile`.
2. Create an ignored `.env.local` with `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from your own Supabase project.
   Never use a service-role key or AI-provider key in browser configuration.
3. Configure an owner account through Supabase Auth, then run `pnpm dev`
   and open `/login`. Never put a password in this repository.

## Database setup

The initial schema and Row Level Security policies are in
`supabase/migrations/20260922201832_initial_finance_schema.sql`, followed by
`20260922202104_fix_function_search_path.sql`. The pending
`20260928172156_validate_fx_snapshot_links.sql` migration checks that linked
rate snapshots have the transaction's currency pair and intended purpose.
The schema enables RLS on all
12 application tables, restricts rows to their owner, and makes settlements and
rate snapshots append-only. Configure Auth and disable public sign-ups for a
single-owner deployment. Verify owner isolation in your target environment.

Check the target database's migration history before applying anything. Do not
reapply existing migrations. Future migrations require review and testing.

## Current boundary

`/workspace` is the authenticated app: accounts, categories, plans, immutable
rate snapshots, actual settlements and linked reversals, split allocations,
transfers, recurring proposals, review queue, calendar, forecast, budget report,
and CSV export. `/` redirects to this protected workspace. `/demo` remains an
older synthetic browser-local demo and is not the private ledger. Do not enter
real financial records there.

The app is configured for no-AI operation. It has no model provider connection,
no receipt storage, and no automatic bank or statement synchronization. The plan
form fetches public reference FX quotes; it saves a rate snapshot only when the
user submits the plan. Use only synthetic data
until backup/export and the full browser workflow are verified. `pnpm test`,
`pnpm lint`, `tsc --noEmit`, and `pnpm build` validate the local code.

## Publication boundary

This public repository contains application code, schema migrations, synthetic
tests, and documentation. Credentials, deployment metadata, ledger exports,
receipts, backups, local browser storage, and build output stay outside Git.
Local checks do not verify a deployed database or an authenticated user workflow.
