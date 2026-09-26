import { test } from "node:test";
import assert from "node:assert/strict";
import { convertToBaseMinor, parseAmountToMinor, parseSignedAmountToMinor, safeMinorNumber } from "./money.ts";

test("money input respects currency minor units", () => {
  assert.equal(parseAmountToMinor("12.34", "GBP"), BigInt(1234));
  assert.equal(parseAmountToMinor("1200", "KRW"), BigInt(1200));
  assert.equal(parseAmountToMinor("12.345", "GBP"), null);
  assert.equal(parseAmountToMinor("1200.5", "KRW"), null);
  assert.equal(parseSignedAmountToMinor("-12.34", "GBP"), BigInt(-1234));
  assert.equal(safeMinorNumber(BigInt("9007199254740992")), null);
});

test("conversion uses source-to-base rate and rounds once", () => {
  assert.equal(convertToBaseMinor(BigInt(1234), "GBP", "KRW", "1800"), BigInt(22212));
  assert.equal(convertToBaseMinor(BigInt(1000), "USD", "GBP", "0.8"), BigInt(800));
  assert.equal(convertToBaseMinor(BigInt(1), "GBP", "KRW", "1800"), BigInt(18));
});
