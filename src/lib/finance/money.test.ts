import { test } from "node:test";
import assert from "node:assert/strict";
import { convertToBaseMinor, currencyFractionDigits, decimalAmountFromMinor, parseAmountToMinor, parseSignedAmountToMinor, safeMinorNumber } from "./money.ts";

test("money input respects currency minor units", () => {
  assert.equal(parseAmountToMinor("12.34", "GBP"), BigInt(1234));
  assert.equal(parseAmountToMinor("1200", "KRW"), BigInt(1200));
  assert.equal(parseAmountToMinor("12.345", "GBP"), null);
  assert.equal(parseAmountToMinor("1200.5", "KRW"), null);
  assert.equal(parseSignedAmountToMinor("-12.34", "GBP"), BigInt(-1234));
  assert.equal(safeMinorNumber(BigInt("9007199254740992")), null);
});

test("ISO currencies use their configured 0, 2, 3, or 4 decimal places", () => {
  assert.equal(currencyFractionDigits("JPY"), 0);
  assert.equal(currencyFractionDigits("GBP"), 2);
  assert.equal(currencyFractionDigits("KWD"), 3);
  assert.equal(currencyFractionDigits("CLF"), 4);
  assert.equal(parseAmountToMinor("1.234", "KWD"), BigInt(1234));
  assert.equal(parseAmountToMinor("1.2345", "CLF"), BigInt(12345));
  assert.equal(parseAmountToMinor("1.0", "JPY"), null);
  assert.equal(decimalAmountFromMinor(1234, "KWD"), "1.234");
  assert.equal(decimalAmountFromMinor(12345, "CLF"), "1.2345");
});

test("minor-unit values convert to editable decimals without floating-point loss", () => {
  assert.equal(decimalAmountFromMinor(9_007_199_254_740_991, "GBP"), "90071992547409.91");
  assert.equal(decimalAmountFromMinor(-123_456, "KWD"), "-123.456");
  assert.equal(decimalAmountFromMinor(7, "CLF"), "0.0007");
  assert.equal(decimalAmountFromMinor(123, "KRW"), "123");
});

test("conversion uses source-to-base rate and rounds once", () => {
  assert.equal(convertToBaseMinor(BigInt(1234), "GBP", "KRW", "1800"), BigInt(22212));
  assert.equal(convertToBaseMinor(BigInt(1000), "USD", "GBP", "0.8"), BigInt(800));
  assert.equal(convertToBaseMinor(BigInt(1), "GBP", "KRW", "1800"), BigInt(18));
  assert.equal(convertToBaseMinor(BigInt(1000), "KWD", "JPY", "500"), BigInt(500));
  assert.equal(convertToBaseMinor(BigInt(10000), "CLF", "KWD", "1000"), BigInt(1000000));
});
