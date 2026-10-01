"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import TransactionDraftsPanel from "@/app/workspace/transaction-drafts-panel";
import type { WorkspaceData } from "@/lib/finance/records";
import type { StatementEvidence, TransactionDraft } from "@/lib/finance/transaction-drafts";

const sampleUserId = "00000000-0000-4000-8000-000000000001";
const sampleDrafts: TransactionDraft[] = [
  {
    id: "sample-receipt-matched",
    user_id: sampleUserId,
    source_key: "receipt:synthetic:1",
    occurred_on: "2026-01-30",
    description: "Example Market",
    direction: "outflow",
    original_amount_minor: 1234,
    currency_code: "GBP",
    payment_method: "Sample travel card · 1234",
    account_id: null,
    category_id: null,
    reference_krw_minor: 22212,
    statement_evidence_id: null,
    settled_actual_id: null,
    notes: "Synthetic test row; not a real purchase.",
    evidence: {
      receipt_hash: "synthetic-only",
      items: [
        { Description: "Example item A", Quantity: "1", TotalPrice: "5.00" },
        { Description: "Example item B", Quantity: "1", TotalPrice: "7.34" },
      ],
    },
    archived: false,
    updated_at: "2026-01-30T12:00:00.000Z",
  },
  {
    id: "sample-receipt-unmatched",
    user_id: sampleUserId,
    source_key: "receipt:synthetic:2",
    occurred_on: "2026-01-28",
    description: "Example shop (sample receipt)",
    direction: "outflow",
    original_amount_minor: 925,
    currency_code: "GBP",
    payment_method: "Sample card · 1234",
    account_id: null,
    category_id: null,
    reference_krw_minor: null,
    statement_evidence_id: null,
    settled_actual_id: null,
    notes: "Synthetic test row; not a real purchase.",
    evidence: { receipt_hash: "synthetic-only", items: [{ Description: "Example item", Quantity: "1", TotalPrice: "9.25" }] },
    archived: false,
    updated_at: "2026-01-30T12:00:00.000Z",
  },
];

const sampleStatements: StatementEvidence[] = [
  {
    id: "sample-statement-matched",
    source_key: "synthetic-file:1",
    occurred_on: "2026-01-30",
    description: "EXAMPLE MARKET (sample)",
    payment_method: "Sample travel card",
    status: "confirmed",
    original_amount_minor: 1234,
    currency_code: "GBP",
    reported_krw_minor: 22212,
    evidence: { source: "synthetic test data" },
  },
  {
    id: "sample-statement-unmatched",
    source_key: "synthetic-file:2",
    occurred_on: "2026-01-29",
    description: "EXAMPLE TRANSIT (sample)",
    payment_method: "Sample travel card",
    status: "confirmed",
    original_amount_minor: 250,
    currency_code: "GBP",
    reported_krw_minor: 4500,
    evidence: { source: "synthetic test data" },
  },
  {
    id: "sample-statement-pending",
    source_key: "synthetic-file:3",
    occurred_on: "2026-01-28",
    description: "EXAMPLE PENDING (sample)",
    payment_method: "Sample travel card",
    status: "approved",
    original_amount_minor: 100,
    currency_code: "GBP",
    reported_krw_minor: null,
    evidence: { source: "synthetic test data" },
  },
];

const sampleData: WorkspaceData = {
  profile: { id: sampleUserId, base_currency: "KRW", timezone: "Europe/London", safety_balance_minor: 0 },
  accounts: [],
  categories: [],
  rates: [],
  plans: [],
  actuals: [],
  splits: [],
  transfers: [],
  merchantRules: [],
  recurringTemplates: [],
};

function makeReadOnlyQuery(table: string) {
  const rows: Record<string, unknown[]> = {
    transaction_drafts: sampleDrafts,
    statement_evidence: sampleStatements,
    statement_debit_confirmations: [],
  };
  const query = {
    select() { return this; },
    eq() { return this; },
    order() { return this; },
    then(resolve: (result: { data: unknown[]; error: null }) => unknown, reject?: (reason: unknown) => unknown) {
      return Promise.resolve({ data: rows[table] ?? [], error: null }).then(resolve, reject);
    },
  };
  return query;
}

const readOnlySupabase = {
  from: (table: string) => makeReadOnlyQuery(table),
} as unknown as SupabaseClient;

export default function FinancePreviewClient() {
  return (
    <TransactionDraftsPanel
      supabase={readOnlySupabase}
      userId={sampleUserId}
      data={sampleData}
      blocked
      revision={0}
      refresh={async () => undefined}
    />
  );
}
