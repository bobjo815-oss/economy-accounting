import { test } from "node:test";
import assert from "node:assert/strict";
import { monthlyActualComposition } from "./reports.ts";
import type { WorkspaceData } from "./records.ts";

function fixture(): WorkspaceData {
  return {
    profile: { id: "owner", base_currency: "KRW", timezone: "Asia/Seoul", safety_balance_minor: 0 },
    accounts: [], categories: [], rates: [], plans: [], transfers: [], merchantRules: [], recurringTemplates: [],
    splits: [],
    actuals: [
      { id: "food", user_id: "owner", plan_id: null, account_id: null, category_id: "living", occurred_on: "2026-09-20", description: "Market", direction: "outflow", entry_kind: "expense", original_amount_minor: 10000, currency_code: "GBP", settlement_amount_minor: 18000, settlement_currency: "KRW", explicit_fee_minor: 500, settlement_fx_snapshot_id: null, settlement_status: "settled", is_reversal: false, correction_of_id: null, created_at: "2026-09-20T00:00:00Z" },
      { id: "pending", user_id: "owner", plan_id: null, account_id: null, category_id: "living", occurred_on: "2026-09-21", description: "Pending", direction: "outflow", entry_kind: "expense", original_amount_minor: 1000, currency_code: "KRW", settlement_amount_minor: 1000, settlement_currency: "KRW", explicit_fee_minor: 0, settlement_fx_snapshot_id: null, settlement_status: "pending_settlement", is_reversal: false, correction_of_id: null, created_at: "2026-09-21T00:00:00Z" },
      { id: "foreign", user_id: "owner", plan_id: null, account_id: null, category_id: "living", occurred_on: "2026-09-22", description: "Foreign", direction: "outflow", entry_kind: "expense", original_amount_minor: 1000, currency_code: "GBP", settlement_amount_minor: 1000, settlement_currency: "GBP", explicit_fee_minor: 0, settlement_fx_snapshot_id: null, settlement_status: "settled", is_reversal: false, correction_of_id: null, created_at: "2026-09-22T00:00:00Z" },
      { id: "replaced", user_id: "owner", plan_id: null, account_id: null, category_id: "living", occurred_on: "2026-09-23", description: "Corrected original", direction: "outflow", entry_kind: "expense", original_amount_minor: 500, currency_code: "KRW", settlement_amount_minor: 500, settlement_currency: "KRW", explicit_fee_minor: 0, settlement_fx_snapshot_id: null, settlement_status: "settled", is_reversal: false, correction_of_id: null, created_at: "2026-09-23T00:00:00Z" },
      { id: "correction", user_id: "owner", plan_id: null, account_id: null, category_id: "travel", occurred_on: "2026-09-23", description: "Corrected replacement", direction: "outflow", entry_kind: "expense", original_amount_minor: 700, currency_code: "KRW", settlement_amount_minor: 700, settlement_currency: "KRW", explicit_fee_minor: 0, settlement_fx_snapshot_id: null, settlement_status: "settled", is_reversal: false, correction_of_id: "replaced", created_at: "2026-09-23T00:00:00Z" },
      { id: "income", user_id: "owner", plan_id: null, account_id: null, category_id: "scholarship", occurred_on: "2026-09-24", description: "Scholarship", direction: "inflow", entry_kind: "income", original_amount_minor: 50000, currency_code: "KRW", settlement_amount_minor: 50000, settlement_currency: "KRW", explicit_fee_minor: 0, settlement_fx_snapshot_id: null, settlement_status: "settled", is_reversal: false, correction_of_id: null, created_at: "2026-09-24T00:00:00Z" },
    ],
  };
}

test("monthly composition includes only settled reporting-currency amounts and counts fees once", () => {
  const result = monthlyActualComposition(fixture(), "2026-09", "outflow");
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows.find((row) => row.categoryId === "living")?.amountMinor, BigInt(18500));
  assert.equal(result.rows.find((row) => row.categoryId === "travel")?.amountMinor, BigInt(700));
  assert.equal(result.unconvertedActuals, 1);
});

test("monthly composition filters by cash direction and supports merchant/source grouping", () => {
  const result = monthlyActualComposition(fixture(), "2026-09", "inflow", "description");
  assert.deepEqual(result.rows.map((row) => [row.label, row.amountMinor]), [["Scholarship", BigInt(50000)]]);
  assert.equal(result.unconvertedActuals, 0);
});
