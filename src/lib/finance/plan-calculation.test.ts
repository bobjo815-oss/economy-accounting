import { test } from "node:test";
import assert from "node:assert/strict";
import { planAmountInBaseMinor } from "./plan-calculation.ts";

test("baseline and forecast rates produce independent planned costs", () => {
  const amount = BigInt(10000); // 100 GBP
  const baseline = planAmountInBaseMinor(amount, "GBP", "KRW", "1800", BigInt(500));
  const forecast = planAmountInBaseMinor(amount, "GBP", "KRW", "1900", BigInt(800));
  assert.equal(baseline, BigInt(180500));
  assert.equal(forecast, BigInt(190800));
  assert.equal(planAmountInBaseMinor(amount, "GBP", "KRW", null, BigInt(500)), null);
});
