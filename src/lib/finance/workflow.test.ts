import { test } from "node:test";
import assert from "node:assert/strict";
import { calendarEvents, paidOriginalMinor, planState, reviewItems } from "./workflow.ts";
import type { WorkspaceData } from "./records.ts";

function fixture(): WorkspaceData {
  return {
    profile: null, accounts: [], categories: [], rates: [], splits: [], transfers: [], merchantRules: [], recurringTemplates: [],
    plans: [{ id: "rent", user_id: "owner", title: "Rent", scheduled_date: "2026-09-15", direction: "outflow", entry_kind: "expense", category_id: null, account_id: null, original_amount_minor: 10000, currency_code: "GBP", base_currency: "GBP", baseline_fx_snapshot_id: null, forecast_fx_snapshot_id: null, baseline_fee_minor: 0, forecast_fee_minor: 0, status: "pending", recurring_template_id: null }],
    actuals: [{ id: "part", user_id: "owner", plan_id: "rent", account_id: null, category_id: null, occurred_on: "2026-09-16", description: "Rent payment", direction: "outflow", entry_kind: "expense", original_amount_minor: 4000, currency_code: "GBP", settlement_amount_minor: 4000, settlement_currency: "GBP", explicit_fee_minor: 0, settlement_fx_snapshot_id: null, settlement_status: "settled", is_reversal: false, correction_of_id: null, created_at: "2026-09-16T00:00:00Z" }],
  };
}

test("plan status changes at overdue boundary and accounts for partial settlement", () => {
  const data = fixture();
  assert.equal(planState(data.plans[0], data.actuals, "2026-09-15"), "pending");
  assert.equal(planState(data.plans[0], data.actuals, "2026-09-16"), "partial · overdue");
  assert.equal(paidOriginalMinor(data.plans[0], data.actuals), BigInt(4000));
});

test("review and calendar show decisions without creating settlements", () => {
  const data = fixture();
  data.actuals.push({ ...data.actuals[0], id: "unmatched", plan_id: null, description: "Unknown charge" });
  assert.deepEqual(reviewItems(data, "2026-09-22").map((item) => item.reason), ["Overdue plan", "Unmatched settlement"]);
  assert.deepEqual(reviewItems(data, "2026-09-22").map((item) => item.href), ["/workspace/plans", "/workspace/actuals"]);
  assert.equal(calendarEvents(data, "2026-09", "2026-09-22").length, 3);
  assert.equal(data.actuals.length, 2);
});

test("future settlement and its later reversal do not rewrite an as-of forecast", () => {
  const data = fixture();
  data.actuals[0].occurred_on = "2026-10-02";
  assert.equal(paidOriginalMinor(data.plans[0], data.actuals, "2026-09-22"), BigInt(0));
  data.actuals.push({ ...data.actuals[0], id: "reverse", occurred_on: "2026-10-03", is_reversal: true, correction_of_id: "part" });
  assert.equal(paidOriginalMinor(data.plans[0], data.actuals, "2026-10-02"), BigInt(4000));
  assert.equal(paidOriginalMinor(data.plans[0], data.actuals, "2026-10-03"), BigInt(0));
});

test("several partial payments complete a plan, while a reversal reopens it", () => {
  const data = fixture();
  data.actuals.push({ ...data.actuals[0], id: "remaining", original_amount_minor: 6000, settlement_amount_minor: 6000 });
  assert.equal(planState(data.plans[0], data.actuals, "2026-09-22"), "completed");
  assert.equal(reviewItems(data, "2026-09-22").some((item) => item.reason === "Overdue plan"), false);
  data.actuals.push({ ...data.actuals[1], id: "reversal", is_reversal: true, correction_of_id: "remaining" });
  assert.equal(planState(data.plans[0], data.actuals, "2026-09-22"), "partial · overdue");
});

test("unsettled payments do not mark a plan as completed", () => {
  const data = fixture();
  data.actuals[0].original_amount_minor = 10000;
  data.actuals[0].settlement_status = "pending_settlement";
  assert.equal(planState(data.plans[0], data.actuals, "2026-09-22"), "overdue");
});
