import test from "node:test";
import assert from "node:assert/strict";
import { draftFields, draftForSettlement, statementCandidates, visibleDrafts, type TransactionDraft, type StatementEvidence } from "./transaction-drafts.ts";
const input = { date: "2026-01-02", description: "Example", amount: "4.50", currency: "GBP", direction: "outflow", paymentMethod: "Example card", referenceKrw: "", notes: "" };
const draft = { id: "draft", occurred_on: input.date, original_amount_minor: 450, currency_code: "GBP", reference_krw_minor: 8000, archived: false, settled_actual_id: null } as TransactionDraft;

test("needs-completion list hides posted entries without deleting their evidence", () => {
  const pending = { ...draft, description: "Example", payment_method: "Example card" };
  const posted = { ...pending, id: "posted", settled_actual_id: "actual" };
  const archived = { ...pending, id: "archived", archived: true };
  const rows = [pending, posted, archived];
  assert.deepEqual(visibleDrafts(rows, { showArchived: false, showCompleted: false, query: "" }), [pending]);
  assert.deepEqual(visibleDrafts(rows, { showArchived: false, showCompleted: true, query: " CARD " }), [pending, posted]);
  assert.equal(visibleDrafts(rows, { showArchived: true, showCompleted: true, query: "" }).length, 3);
  assert.equal(visibleDrafts(rows, { showArchived: true, showCompleted: true, query: "not found" }).length, 0);
  assert.equal(rows.length, 3);
  assert.equal(posted.settled_actual_id, "actual");
});
test("a purchase can be saved without an account, category or final settlement amount", () => {
  const parsed = draftFields(input);
  assert.equal(parsed?.original_amount_minor, 450);
  assert.equal(parsed?.reference_krw_minor, null);
  assert.equal(draftFields({ ...input, referenceKrw: "0" })?.reference_krw_minor, 0);
  assert.equal(draftFields({ ...input, amount: "4.501" }), null);
  assert.equal(draftFields({ ...input, date: "2026-02-30" }), null);
  assert.equal(draftFields({ ...input, currency: "" }), null);
});
test("adding a KRW reference never invents a debit or changes the original GBP amount", () => {
  const staged = draftForSettlement(draft);
  assert.equal(staged?.originalAmountMinor, 450);
  assert.equal(staged?.originalCurrency, "GBP");
  assert.equal(staged?.settlementAmount, "");
  assert.equal(draftForSettlement({ ...draft, settled_actual_id: "actual" }), null);
});
test("matches remain candidates; pending, canceled, currency-mismatched and old rows are excluded", () => {
  const row = { id: "row", occurred_on: input.date, status: "confirmed", original_amount_minor: 450, currency_code: "GBP" } as StatementEvidence;
  assert.equal(statementCandidates(draft, [row, { ...row, id: "second" }]).length, 2);
  assert.equal(statementCandidates(draft, [{ ...row, status: "approved" }, { ...row, status: "canceled" }, { ...row, currency_code: "USD" }, { ...row, occurred_on: "2026-02-01" }]).length, 0);
});
