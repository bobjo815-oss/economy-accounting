import test from "node:test";
import assert from "node:assert/strict";
import { draftFields, draftForSettlement, isUniqueReceiptStatementPair, receiptCandidatesForStatement, receiptMatchedActual, statementCandidates, statementRowsForReconciliation, verifiedReceiptStatementMatch, visibleDrafts, type TransactionDraft, type StatementEvidence } from "./transaction-drafts.ts";
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
test("a receipt-backed statement candidate is linked to the receipt draft, never duplicated", () => {
  const receipt = { ...draft, id: "receipt", description: "Morrisons", occurred_on: "2026-09-30", original_amount_minor: 1716, currency_code: "GBP", statement_evidence_id: null,
    evidence: { receipt_hash: "private-receipt-hash", items: [{ Description: "Example item" }], candidate_source_keys: ["statement-file:3"] } } as TransactionDraft;
  const statement = { id: "statement", source_key: "statement-file:3", description: "MORRISONS SHEFFIELD -", occurred_on: "2026-09-30", status: "approved", original_amount_minor: 1716, currency_code: "GBP" } as StatementEvidence;
  assert.deepEqual(receiptCandidatesForStatement(statement, [receipt]), [receipt]);
  assert.equal(isUniqueReceiptStatementPair(receipt, statement, [receipt], [statement]), true);
  const duplicateReceipt = { ...receipt, id: "receipt-copy" };
  assert.equal(isUniqueReceiptStatementPair(receipt, statement, [receipt, duplicateReceipt], [statement]), false);
  const secondStatement = { ...statement, id: "statement-copy", source_key: "statement-file:4" };
  assert.equal(isUniqueReceiptStatementPair(receipt, statement, [receipt], [statement, secondStatement]), false);
  assert.equal(receiptCandidatesForStatement({ ...statement, status: "canceled" }, [receipt]).length, 0);
});
test("reconciliation hides linked or non-actionable rows by default and can reveal completed evidence", () => {
  const receipt = { ...draft, id: "receipt", description: "Morrisons", occurred_on: "2026-09-30", original_amount_minor: 1716, currency_code: "GBP", statement_evidence_id: "linked", source_key: "receipt:file:1",
    evidence: { receipt_hash: "private-hash", items: [{ Description: "Item" }] } } as TransactionDraft;
  const linked = { id: "linked", source_key: "statement:file:linked", occurred_on: "2026-09-30", description: "MORRISONS", status: "confirmed", original_amount_minor: 1716, currency_code: "GBP" } as StatementEvidence;
  const needsReceipt = { ...linked, id: "unmatched", source_key: "statement:file:unmatched", description: "OTHER", original_amount_minor: 500 } as StatementEvidence;
  const pending = { ...needsReceipt, id: "pending", status: "approved" } as StatementEvidence;
  const canceled = { ...needsReceipt, id: "canceled", status: "canceled" } as StatementEvidence;
  assert.deepEqual(statementRowsForReconciliation([linked, needsReceipt, pending, canceled], [receipt]).map(row => row.id), ["unmatched"]);
  assert.deepEqual(statementRowsForReconciliation([linked, needsReceipt, pending, canceled], [receipt], true).map(row => row.id), ["linked", "unmatched"]);
});
test("a unique confirmed payment-total match is resolved despite OCR line-sum errors or merchant variants", () => {
  const receipt = { ...draft, id: "receipt", description: "Wm Morrison Supermarkets", occurred_on: "2026-09-30", original_amount_minor: 1716, currency_code: "GBP", statement_evidence_id: null,
    evidence: { receipt_hash: "private-hash", items: [{ Description: "Item", TotalPrice: "16.00" }] } } as TransactionDraft;
  const match = { id: "match", source_key: "statement:file:match", occurred_on: "2026-10-01", description: "MORRISONS SHEFFIELD -", status: "confirmed", original_amount_minor: 1716, currency_code: "GBP" } as StatementEvidence;
  assert.equal(verifiedReceiptStatementMatch(receipt, [receipt], [match])?.id, match.id);
  assert.deepEqual(statementRowsForReconciliation([match], [receipt]), []);
  assert.deepEqual(statementRowsForReconciliation([match], [receipt], true), [match]);
  assert.equal(verifiedReceiptStatementMatch(receipt, [receipt], [{ ...match, original_amount_minor: 1715 }]), null);
  assert.equal(verifiedReceiptStatementMatch({ ...receipt, occurred_on: "2026-09-20" }, [receipt], [match]), null);
  assert.equal(verifiedReceiptStatementMatch({ ...receipt, currency_code: "USD" }, [receipt], [match]), null);
  const sameTotal = { ...match, id: "second", source_key: "statement:file:second", occurred_on: "2026-09-30" };
  assert.equal(verifiedReceiptStatementMatch(receipt, [receipt], [match, sameTotal]), null);
});
test("a merchant match disambiguates equal-price statement candidates", () => {
  const receipt = { ...draft, id: "sainsbury-receipt", description: "Sainsbury's Supermarkets Ltd", occurred_on: "2026-09-30", original_amount_minor: 100, currency_code: "GBP", statement_evidence_id: null,
    evidence: { items: [{ Description: "Item", TotalPrice: "1.00" }] } } as TransactionDraft;
  const matching = { id: "sainsbury-statement", source_key: "sainsburys", occurred_on: "2026-09-30", description: "SAINSBURYS", status: "confirmed", original_amount_minor: 100, currency_code: "GBP" } as StatementEvidence;
  const competitor = { ...matching, id: "bus-statement", source_key: "bus", description: "FIRST SOUTH YORKSHIRE" };
  assert.equal(verifiedReceiptStatementMatch(receipt, [receipt], [matching, competitor])?.id, matching.id);
});
test("a uniquely matched approval is evidence only and is removed from the compare queue, not settled", () => {
  const receipt = { ...draft, id: "pending-receipt", description: "Morrisons", occurred_on: "2026-09-30", original_amount_minor: 1716, currency_code: "GBP", statement_evidence_id: null,
    evidence: { items: [{ Description: "Item", TotalPrice: "17.16" }] } } as TransactionDraft;
  const approval = { id: "approval", source_key: "card:approval", occurred_on: "2026-09-30", description: "MORRISONS SHEFFIELD", status: "approved", original_amount_minor: 1716, currency_code: "GBP" } as StatementEvidence;
  assert.equal(verifiedReceiptStatementMatch(receipt, [receipt], [approval])?.id, approval.id);
  assert.deepEqual(statementRowsForReconciliation([approval], [receipt]), []);
  assert.deepEqual(statementRowsForReconciliation([approval], [receipt], true), [approval]);
  assert.equal(receiptMatchedActual(receipt, [receipt], [approval], []), null);
});
test("a fully matched receipt hides its separate draft when the exact purchase already exists", () => {
  const receipt = { ...draft, id: "receipt", description: "Morrisons", occurred_on: "2026-09-30", original_amount_minor: 1716, currency_code: "GBP", direction: "outflow", statement_evidence_id: null, evidence: { items: [{ Description: "Item", TotalPrice: "16.00" }] } } as TransactionDraft;
  const statement = { id: "statement", source_key: "file:1", description: "MORRISONS SHEFFIELD", occurred_on: "2026-10-01", status: "confirmed", original_amount_minor: 1716, currency_code: "GBP" } as StatementEvidence;
  const statementDraft = { ...draft, id: "statement-draft", source_key: "statement:file:1", description: statement.description, occurred_on: statement.occurred_on, original_amount_minor: 1716, currency_code: "GBP", statement_evidence_id: statement.id, settled_actual_id: "actual", evidence: {} } as TransactionDraft;
  const actual = { id: "actual", description: "MORRISONS SHEFFIELD", occurred_on: statement.occurred_on, direction: "outflow", currency_code: "GBP", original_amount_minor: 1716, settlement_status: "settled", is_reversal: false, correction_of_id: null, replacement_of_id: null } as import("./records.ts").ActualRow;
  const rows = [receipt, statementDraft];
  assert.equal(receiptMatchedActual(receipt, rows, [statement], [actual])?.id, actual.id);
  assert.deepEqual(visibleDrafts(rows, { showArchived: false, showCompleted: false, query: "" }, [actual], [statement]), []);
  assert.deepEqual(visibleDrafts(rows, { showArchived: false, showCompleted: true, query: "" }, [actual], [statement]), [receipt, statementDraft]);
  assert.equal(receiptMatchedActual(receipt, rows, [statement], [{ ...actual, settlement_status: "pending_settlement" }]), null);
  assert.equal(receiptMatchedActual(receipt, rows, [{ ...statement, original_amount_minor: 1715 }], [actual]), null);
  assert.equal(receiptMatchedActual(receipt, rows, [statement, { ...statement, id: "duplicate-statement", source_key: "file:2" }], [actual]), null);
});
