import test from "node:test";
import assert from "node:assert/strict";
import type { ActualRow } from "../finance/records.ts";
import { parseCsv, parseStatementRows, suggestMapping, type StatementEntry } from "./parse.ts";
import { reconcileStatement } from "./match.ts";

test("CSV mapping preserves quoted descriptions, directions, dates, and source rows", () => {
  const table = parseCsv('Date;Merchant;Amount\r\n21/09/2026;"Market; East";-12,50\r\n22/09/2026;Refund;3,00\r\n');
  const mapping = suggestMapping(table.rows);
  mapping.positiveMeans = "inflow";
  const parsed = parseStatementRows(table.rows, mapping, "GBP");
  assert.deepEqual(parsed.issues, []);
  assert.equal(parsed.entries[0].description, "Market; East");
  assert.equal(parsed.entries[0].date, "2026-09-21");
  assert.equal(parsed.entries[0].amountMinor, BigInt(1250));
  assert.equal(parsed.entries[0].direction, "outflow");
  assert.equal(parsed.entries[0].sourceRow, 2);
  assert.equal(parsed.entries[1].direction, "inflow");
});

test("separate debit and credit columns never turn an ambiguous row into a transaction", () => {
  const rows = [
    ["거래일", "가맹점", "출금", "입금"],
    ["2026-09-22", "Shop", "1,200", ""],
    ["2026-09-23", "Refund", "", "700"],
    ["2026-09-24", "Unclear", "100", "200"],
    ["01/02/2026", "Date order", "300", ""],
  ];
  const mapping = suggestMapping(rows);
  assert.equal(mapping.amountMode, "debit-credit");
  const parsed = parseStatementRows(rows, mapping, "KRW");
  assert.equal(parsed.entries.length, 3);
  assert.equal(parsed.entries[0].amountMinor, BigInt(1200));
  assert.equal(parsed.entries[1].direction, "inflow");
  assert.deepEqual(parsed.issues, [{ sourceRow: 4, reason: "amount" }]);
  assert.equal(parsed.entries[2].date, "2026-02-01");
});

test("card statement amounts can be positive expenses, with DR/CR taking precedence", () => {
  const rows = [
    ["Date", "Description", "Amount", "Currency"],
    ["2026-09-25", "Card shop", "12.50", "GBP"],
    ["2026-09-26", "Fee", "2.00 DR", ""],
    ["2026-09-27", "Refund", "3.00 CR", "GBP"],
    ["2026-09-28", "Other currency", "4.00", "USD"],
  ];
  const parsed = parseStatementRows(rows, suggestMapping(rows), "GBP");
  assert.deepEqual(parsed.entries.map((item) => item.direction), ["outflow", "outflow", "inflow"]);
  assert.deepEqual(parsed.issues, [{ sourceRow: 5, reason: "currency" }]);
});

test("bank timestamps and trailing minus signs retain their source meaning", () => {
  const rows = [["Date", "Description", "Amount"], ["2026-09-25T12:34:00", "Shop", "12.50-"]];
  const mapping = suggestMapping(rows);
  mapping.positiveMeans = "inflow";
  const parsed = parseStatementRows(rows, mapping, "GBP");
  assert.equal(parsed.entries[0].date, "2026-09-25");
  assert.equal(parsed.entries[0].direction, "outflow");
  assert.equal(parsed.entries[0].amountMinor, BigInt(1250));
});

const entry = (sourceRow: number, date: string, description: string, amountMinor: bigint): StatementEntry => ({
  sourceRow, date, description, amountMinor, currency: "GBP", direction: "outflow",
});
const actual = (id: string, occurred_on: string, description: string, amountMinor: number): ActualRow => ({
  id, user_id: "user", plan_id: null, account_id: "card", category_id: null, occurred_on, description,
  direction: "outflow", entry_kind: "expense", original_amount_minor: amountMinor, currency_code: "GBP",
  settlement_amount_minor: amountMinor, settlement_currency: "GBP", explicit_fee_minor: 0,
  settlement_fx_snapshot_id: null, settlement_status: "settled", is_reversal: false, correction_of_id: null,
  created_at: "2026-09-22T00:00:00Z",
});

test("reconciliation flags missing receipts/entries and keeps ambiguous matches for review", () => {
  const rows = [
    entry(2, "2026-09-22", "CARD MARKET", BigInt(1250)),
    entry(3, "2026-09-23", "NO RECEIPT SHOP", BigInt(990)),
    entry(4, "2026-09-24", "OTHER SHOP", BigInt(300)),
  ];
  const saved = [actual("a", "2026-09-21", "Market", 1250), actual("b", "2026-09-24", "UNKNOWN", 300), actual("c", "2026-09-22", "Ledger only", 850)];
  const result = reconcileStatement(rows, saved, "card");
  assert.deepEqual(result.matches.map((item) => item.status), ["recorded", "missing", "review"]);
  assert.deepEqual(result.ledgerOnly.map((item) => item.id), ["c"]);
});

test("duplicate statement rows and one ledger payment cannot be marked as two recorded purchases", () => {
  const rows = [entry(2, "2026-09-22", "Market", BigInt(1250)), entry(3, "2026-09-22", "Market", BigInt(1250))];
  const result = reconcileStatement(rows, [actual("a", "2026-09-22", "Market", 1250)], "card");
  assert.deepEqual(result.matches.map((item) => item.status), ["review", "review"]);
  assert.deepEqual(result.matches.map((item) => item.reason), ["duplicate-row", "duplicate-row"]);
});
