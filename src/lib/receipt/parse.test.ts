import assert from "node:assert/strict";
import test from "node:test";
import { parseReceiptText } from "./parse.ts";

test("parses common English receipt fields without treating subtotal as the total", () => {
  const parsed = parseReceiptText(`
MARKS & SPENCER
21/09/2026 18:42
Milk 2.50
Bread 1,234.56
SUBTOTAL 1,237.06
TOTAL GBP 1,237.06
`);

  assert.equal(parsed.merchant, "MARKS & SPENCER");
  assert.equal(parsed.date, "2026-09-21");
  assert.equal(parsed.total, "1237.06");
  assert.equal(parsed.currency, "GBP");
  assert.deepEqual(parsed.items, ["Milk", "Bread"]);
});

test("parses Korean date and won total while leaving ambiguous dates blank", () => {
  const parsed = parseReceiptText(`
서울 마트
2026년 9월 21일 18:42
우유 3,000원
합계 ₩6,000
`);
  const ambiguous = parseReceiptText("SHOP\n01/02/2026\nTOTAL $12.00");

  assert.equal(parsed.merchant, "서울 마트");
  assert.equal(parsed.date, "2026-09-21");
  assert.equal(parsed.total, "6000");
  assert.equal(parsed.currency, "KRW");
  assert.equal(ambiguous.date, null);
});

test("uses the final payable amount after an earlier total or discount", () => {
  const parsed = parseReceiptText(`SAMPLE MARKET\n25/03/2025\nTOTAL £24.00\nOFFER -£2.00\nBALANCE BEFORE DEDUCTIONS £22.00\nCARD £22.00`);
  assert.equal(parsed.date, "2025-03-25");
  assert.equal(parsed.total, "22.00");
  assert.equal(parsed.currency, "GBP");
  assert.deepEqual(parsed.items, []);
});

test("reads compact English dates and balance due", () => {
  const parsed = parseReceiptText(`SAMPLE MARKET\n12JAN2026\nSAUCE 2.60\nBALANCE DUE £2.60`);
  assert.equal(parsed.date, "2026-01-12");
  assert.equal(parsed.total, "2.60");
  assert.deepEqual(parsed.items, ["SAUCE"]);
});

test("keeps purchase currency separate from another currency on a card line", () => {
  const parsed = parseReceiptText(`AIRPORT SHOP\n18/09/2026\nGOODS $79.00\nTOTAL $79.00\nCARD KRW 108,095`);
  assert.equal(parsed.total, "79.00");
  assert.equal(parsed.currency, "USD");
});

test("suggests a ticket price only when every printed currency amount agrees", () => {
  const ticket = parseReceiptText(`BUS COMPANY\n24/09/26\nSINGLE TICKET £1.80\nFARE £1.80`);
  const mixed = parseReceiptText(`BUS COMPANY\n24/09/26\nSINGLE TICKET £1.80\nEXTRA £0.50`);
  assert.equal(ticket.total, "1.80");
  assert.equal(ticket.currency, "GBP");
  assert.equal(mixed.total, null);
});
