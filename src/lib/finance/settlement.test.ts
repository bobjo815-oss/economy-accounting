import { test } from "node:test";
import assert from "node:assert/strict";
import { actualCostMinor, cashEffectMinor, createReversal, validateSettlement, type Settlement, type SettlementInput } from "./settlement.ts";

const example: SettlementInput = {
  kind: "settlement",
  correctionOfId: null,
  occurredOn: "2026-09-22",
  description: "Synthetic test purchase",
  direction: "Outflow",
  planId: null,
  originalAmountMinor: "1000",
  originalCurrency: "USD",
  settlementAmountMinor: "800",
  settlementCurrency: "GBP",
  feeTreatment: "included",
  explicitFeeMinor: "0",
  observedFxRate: null,
};

test("an all-in debit counts the embedded fee once", () => {
  assert.equal(validateSettlement(example), null);
  assert.equal(actualCostMinor(example), BigInt(800));
  assert.equal(cashEffectMinor(example), BigInt(-800));
  assert.match(validateSettlement({ ...example, explicitFeeMinor: "20" }) ?? "", /included fee/);
});

test("a separately charged fee increases outflow cost", () => {
  const record = { ...example, feeTreatment: "separate" as const, explicitFeeMinor: "20" };
  assert.equal(validateSettlement(record), null);
  assert.equal(actualCostMinor(record), BigInt(820));
  assert.equal(cashEffectMinor(record), BigInt(-820));
});

test("an inflow fee reduces received cash", () => {
  const record = { ...example, direction: "Inflow" as const, feeTreatment: "separate" as const, explicitFeeMinor: "20" };
  assert.equal(validateSettlement(record), null);
  assert.equal(cashEffectMinor(record), BigInt(780));
});

test("a linked reversal cancels the original cash effect without changing it", () => {
  const original: Settlement = {
    ...example, id: "original-id", recordedAt: "2026-09-22T12:00:00.000Z",
    feeTreatment: "separate", explicitFeeMinor: "20",
  };
  const reversal = createReversal(original, "reversal-id", "2026-09-23T12:00:00.000Z");
  assert.equal(validateSettlement(reversal), null);
  assert.equal(cashEffectMinor(original) + cashEffectMinor(reversal), BigInt(0));
  assert.equal(original.explicitFeeMinor, "20");
  assert.equal(original.occurredOn, "2026-09-22");
  assert.equal(reversal.occurredOn, "2026-09-23");
  assert.equal(reversal.correctionOfId, original.id);
});
