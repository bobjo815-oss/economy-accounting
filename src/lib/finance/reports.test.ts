import { test } from "node:test";
import assert from "node:assert/strict";
import { accountBalances, forecast, monthlyCategoryResults } from "./reports.ts";
import type { WorkspaceData } from "./records.ts";

function fixture(): WorkspaceData {
  return {
    profile: { id: "owner", base_currency: "GBP", timezone: "Europe/London", safety_balance_minor: 0 },
    accounts: [
      { id: "bank", user_id: "owner", name: "Bank", currency_code: "GBP", opening_balance_minor: 100000, is_active: true },
      { id: "savings", user_id: "owner", name: "Savings", currency_code: "GBP", opening_balance_minor: 50000, is_active: true },
    ],
    categories: [], rates: [],
    plans: [{ id: "rent", user_id: "owner", title: "Rent", scheduled_date: "2026-10-01", direction: "outflow", entry_kind: "expense", category_id: null, account_id: "bank", original_amount_minor: 30000, currency_code: "GBP", base_currency: "GBP", baseline_fx_snapshot_id: null, forecast_fx_snapshot_id: null, baseline_fee_minor: 0, forecast_fee_minor: 0, status: "pending", recurring_template_id: null }],
    actuals: [{ id: "paid", user_id: "owner", plan_id: null, account_id: "bank", category_id: null, occurred_on: "2026-09-20", description: "Groceries", direction: "outflow", entry_kind: "expense", original_amount_minor: 1000, currency_code: "GBP", settlement_amount_minor: 1000, settlement_currency: "GBP", explicit_fee_minor: 0, settlement_fx_snapshot_id: null, settlement_status: "settled", is_reversal: false, correction_of_id: null, created_at: "2026-09-20T00:00:00Z" }],
    splits: [],
    transfers: [{ id: "transfer", user_id: "owner", occurred_on: "2026-09-21", description: "Move to savings", from_account_id: "bank", to_account_id: "savings", from_amount_minor: 20000, to_amount_minor: 20000, explicit_fee_minor: 0, transfer_fx_snapshot_id: null }],
    merchantRules: [], recurringTemplates: [],
  };
}

test("balances include actuals and both transfer legs without inflating household cash", () => {
  const data = fixture();
  const balances = accountBalances(data);
  assert.equal(balances.get("bank"), BigInt(79000));
  assert.equal(balances.get("savings"), BigInt(70000));
  assert.equal([...balances.values()].reduce((a, b) => a + b, BigInt(0)), BigInt(149000));
});

test("forecast begins at selected balances and adds only outstanding plans", () => {
  const data = fixture();
  const result = forecast(data, "2026-09-22", 3, null);
  assert.equal(result.openingMinor, BigInt(149000));
  assert.equal(result.closingMinor, BigInt(119000));
  assert.equal(result.lowestMinor, BigInt(119000));
  assert.equal(result.events.length, 1);
});

test("monthly budget keeps forecast and actual columns separate", () => {
  const data = fixture();
  const september = monthlyCategoryResults(data, "2026-09");
  const october = monthlyCategoryResults(data, "2026-10");
  assert.equal(september.totals.get("uncategorized")?.actualMinor, BigInt(1000));
  assert.equal(october.totals.get("uncategorized")?.plannedMinor, BigInt(30000));
});

test("a split allocates one actual cost across categories exactly once", () => {
  const data = fixture();
  data.actuals[0].original_amount_minor = 1000;
  data.actuals[0].settlement_amount_minor = 1030;
  data.splits = [
    { id: "s1", user_id: "owner", actual_transaction_id: "paid", category_id: "food", original_amount_minor: 600 },
    { id: "s2", user_id: "owner", actual_transaction_id: "paid", category_id: "supplies", original_amount_minor: 400 },
  ];
  const results = monthlyCategoryResults(data, "2026-09").totals;
  const allocated = (results.get("food")?.actualMinor ?? BigInt(0)) + (results.get("supplies")?.actualMinor ?? BigInt(0));
  assert.equal(allocated, BigInt(1030));
});
