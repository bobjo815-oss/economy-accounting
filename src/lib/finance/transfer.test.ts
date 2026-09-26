import { test } from "node:test";
import assert from "node:assert/strict";
import { transferCashFlowMinor, transferLegs } from "./transfer.ts";

test("a same-currency transfer has two account legs and no principal cash flow", () => {
  const transfer = { from_account_id: "a", to_account_id: "b", from_amount_minor: 10000, to_amount_minor: 10000, explicit_fee_minor: 0 };
  const legs = transferLegs(transfer);
  assert.equal(legs.length, 2);
  assert.equal(legs[0].amountMinor + legs[1].amountMinor, BigInt(0));
  assert.equal(transferCashFlowMinor(transfer), BigInt(0));
});

test("only an explicit transfer fee is household spending", () => {
  const transfer = { from_account_id: "a", to_account_id: "b", from_amount_minor: 10000, to_amount_minor: 10000, explicit_fee_minor: 150 };
  assert.equal(transferCashFlowMinor(transfer), BigInt(-150));
});
