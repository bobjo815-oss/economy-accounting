import test from "node:test";
import assert from "node:assert/strict";
import { allocateReceiptItems, effectiveKrwRate, merchantAgrees, receiptField, receiptItemTotal } from "./statement-settlement.ts";
test("derived rate preserves foreign units and cannot manufacture a missing debit", () => {
  assert.equal(effectiveKrwRate(1000,"GBP",18000),"1800.00000000");
  assert.equal(effectiveKrwRate(0,"GBP",18000),null);
  assert.equal(effectiveKrwRate(1000,"USD",0),null);
  assert.equal(effectiveKrwRate(1234,"KWD",18000),"14586.70988655");
});
test("item allocations distribute a final discount and every won exactly once", () => {
  const items = [{Description:"A",TotalPrice:"8.00"},{Description:"B",TotalPrice:"7.00"},{Description:"Discount",TotalPrice:"-1.00"}];
  const result = allocateReceiptItems(items,1400,"GBP",25001)!;
  assert.equal(result.reduce((n,r)=>n+r.amountKrw,0),25001);
  assert.equal(result.length,2);
  assert.equal(items[0].TotalPrice,"8.00");
  const thirds = allocateReceiptItems(Array.from({length:3},()=>({TotalPrice:"1.00"})),300,"USD",100)!;
  assert.deepEqual(thirds.map(r=>r.amountKrw),[34,33,33]);
});
test("one item receives the entire confirmed debit even when its OCR line price is missing", () => {
  assert.equal(allocateReceiptItems([{Description:{valueString:"One item"}}],1000,"GBP",18001)![0].amountKrw,18001);
  assert.equal(allocateReceiptItems([{Description:"One item",TotalPrice:"2.00"}],1000,"GBP",18001)!.length,1);
  assert.equal(allocateReceiptItems([{Description:"Discount",TotalPrice:"-1.00"}],1000,"GBP",18001),null);
});
test("unknown items do not silently consume the entire debit; source objects are readable", () => {
  const result=allocateReceiptItems([{TotalPrice:{valueCurrency:{amount:2}}},{Description:"Missing"}],1000,"GBP",18000)!;
  assert.equal(result[1].unitemized,true);
  assert.equal(result[0].amountKrw,3600);
  assert.equal(allocateReceiptItems([{TotalPrice:"20.00"},{}],1000,"GBP",18000),null);
  assert.equal(receiptField({valueString:"Synthetic merchant"}),"Synthetic merchant");
  assert.equal(merchantAgrees("Example Shop","EXAMPLE SHOP 123"),true);
  assert.equal(merchantAgrees("Example Shop","Other Shop"),false);
  assert.equal(merchantAgrees("Wm Morrison Supermarkets Ltd BD3 7DL", "MORRISONS SHEFFIELD -"),true);
  assert.equal(merchantAgrees("Boots UK Limited", "BOOTS,BROOMHILL"),true);
  assert.equal(merchantAgrees("Sainsbury's Supermarkets Ltd", "SAINSBURYS"),true);
});
test("receipt item reconciliation includes discounts and keeps missing line amounts explicit", () => {
  assert.deepEqual(receiptItemTotal([{ TotalPrice: "14.85" }, { Description: "Discount", TotalPrice: "-1.00" }], "GBP"), {
    amountMinor: 1385, itemCount: 2, missingAmountCount: 0,
  });
  assert.deepEqual(receiptItemTotal([{ TotalPrice: "8.00" }, { Description: "Unknown" }], "GBP"), {
    amountMinor: 800, itemCount: 2, missingAmountCount: 1,
  });
  assert.deepEqual(receiptItemTotal([{ TotalPrice: { valueCurrency: { amount: 4.25 } } }], "GBP"), {
    amountMinor: 425, itemCount: 1, missingAmountCount: 0,
  });
});
