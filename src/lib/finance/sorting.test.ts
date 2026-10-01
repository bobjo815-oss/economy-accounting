import { test } from "node:test";
import assert from "node:assert/strict";
import { compareBigInt, compareText, sortRows, sortWorkspaceLists } from "./sorting.ts";
import type { WorkspaceData } from "./records.ts";

test("sorting is stable for equal keys and compares large minor-unit integers exactly", () => {
  const rows = [{ name: "item 2", amount: BigInt("9007199254740995") }, { name: "item 1", amount: BigInt("9007199254740994") }, { name: "ITEM 2", amount: BigInt("9007199254740995") }];
  assert.deepEqual(sortRows(rows, (a, b) => compareBigInt(a.amount, b.amount)).map((row) => row.name), ["item 1", "item 2", "ITEM 2"]);
  assert.equal(compareText("item 2", "item 10", "en") < 0, true);
});

test("workspace list sorting orders dates and keeps amount comparisons grouped by currency", () => {
  const actual = (id: string, date: string, amount: number, currency: "GBP" | "KRW", description: string) => ({
    id, user_id: "owner", plan_id: null, account_id: null, category_id: null, occurred_on: date, description,
    direction: "outflow" as const, entry_kind: "expense" as const, original_amount_minor: amount, currency_code: currency,
    settlement_amount_minor: amount, settlement_currency: currency, explicit_fee_minor: 0,
    settlement_fx_snapshot_id: null, settlement_status: "settled" as const, is_reversal: false, correction_of_id: null,
    created_at: `${date}T00:00:00Z`,
  });
  const data: WorkspaceData = {
    profile: null, accounts: [], categories: [], rates: [], plans: [], splits: [], transfers: [], merchantRules: [], recurringTemplates: [],
    actuals: [actual("krw-high", "2026-09-20", 30000, "KRW", "Zeta"), actual("gbp", "2026-09-22", 100, "GBP", "Alpha"), actual("krw-low", "2026-09-21", 10000, "KRW", "Beta")],
  };
  const baseOrder = { actuals: "amount-asc", plans: "date-asc", accounts: "name", categories: "name", recurring: "date-asc", transfers: "date-desc" };
  assert.deepEqual(sortWorkspaceLists(data, baseOrder, "ko").actuals.map((row) => row.id), ["gbp", "krw-low", "krw-high"]);
  assert.deepEqual(sortWorkspaceLists(data, { ...baseOrder, actuals: "date-desc" }, "ko").actuals.map((row) => row.id), ["gbp", "krw-low", "krw-high"]);
});
