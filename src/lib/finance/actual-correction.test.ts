import test from "node:test";
import assert from "node:assert/strict";
import { correctionFields, correctionPayload, storedCorrectionFields } from "./actual-correction.ts";
import type { ActualRow, WorkspaceData } from "./records.ts";

const data = { accounts: [{ id: "account", currency_code: "KRW", is_active: true }], categories: [{ id: "category", normal_direction: "outflow", is_active: true }], plans: [], splits: [] } as unknown as WorkspaceData;
const original = { id: "original", occurred_on: "2026-01-02", description: "Example", direction: "outflow", entry_kind: "expense", account_id: "account", category_id: "category", plan_id: null,
  original_amount_minor: 450, currency_code: "GBP", settlement_amount_minor: 8000, settlement_currency: "KRW", explicit_fee_minor: 0, settlement_fx_snapshot_id: "old-rate", is_reversal: false } as ActualRow;
test("unfinished inputs can be restored without qualifying for ledger confirmation", () => {
  const proposal = { ...correctionFields(original,data),amount: "not yet known",settled: "",splits: [] };
  assert.deepEqual(storedCorrectionFields(proposal),proposal);
  assert.equal(correctionPayload(proposal,data),null);
  assert.equal(storedCorrectionFields({ ...proposal,amount: {} }),null);
  assert.equal(storedCorrectionFields({ ...proposal,splits: [{}] }),null);
  assert.equal(storedCorrectionFields(null),null);
});
test("inline correction preserves the source and does not reuse a stale FX observation", () => {
  const fields = correctionFields(original,data);
  const result = correctionPayload({ ...fields,description: "Corrected example",settled: "8101",amount: "4.60" },data);
  assert.equal(result?.p_actual.settlement_amount_minor,8101);
  assert.equal(result?.p_actual.original_amount_minor,460);
  assert.equal(result?.p_actual.explicit_fee_minor,0);
  assert.equal(result?.p_actual.settlement_fx_snapshot_id,null);
  assert.equal(original.settlement_amount_minor,8000);
  assert.equal(original.description,"Example");
});
test("corrections reject invalid dates, money, accounts, categories and incomplete splits", () => {
  const fields = correctionFields(original,data);
  for (const change of [{ date: "2026-02-30" },{ amount: "4.501" },{ settled: "-1" },{ currency: "QQQ" },{ accountId: "other" },{ categoryId: "other" },{ fee: "-1" }]) assert.equal(correctionPayload({ ...fields,...change },data),null);
  assert.equal(correctionPayload({ ...fields,splits: [{ categoryId: "category",amount: "2" },{ categoryId: "category",amount: "2" }] },data),null);
  const result = correctionPayload({ ...fields,splits: [{ categoryId: "category",amount: "2" },{ categoryId: "category",amount: "2.50" }] },data);
  assert.equal(result?.p_actual.category_id,null);
  assert.deepEqual(result?.p_splits.map(s => s.original_amount_minor),[200,250]);
});

test("different currency payment or refund amounts never invent a separate fee", () => {
  const fields = correctionFields(original,data);
  assert.equal(correctionPayload({ ...fields,settled: "9000" },data)?.p_actual.explicit_fee_minor,0);
  assert.equal(correctionPayload({ ...fields,kind: "income",categoryId: "",settled: "7500" },data)?.p_actual.explicit_fee_minor,0);
  assert.equal(correctionPayload({ ...fields,fee: "100" },data)?.p_actual.explicit_fee_minor,100);
  assert.equal(original.explicit_fee_minor,0);
});
