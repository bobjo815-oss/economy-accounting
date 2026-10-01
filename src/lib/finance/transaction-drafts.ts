import { parseAmountToMinor, safeMinorNumber, supportedCurrencies, type CurrencyCode } from "./money.ts";
import { merchantAgrees } from "./statement-settlement.ts";
import type { ActualRow } from "./records.ts";

export type TransactionDraft = {
  id: string; user_id: string; source_key: string; occurred_on: string; description: string;
  direction: "inflow" | "outflow"; original_amount_minor: number; currency_code: CurrencyCode;
  payment_method: string; account_id: string | null; category_id: string | null;
  reference_krw_minor: number | null; statement_evidence_id: string | null;
  settled_actual_id: string | null; notes: string; evidence: Record<string, unknown>;
  archived: boolean; updated_at: string;
  confirmed_debit_krw?: number;
};
export type StatementEvidence = {
  id: string; source_key: string; occurred_on: string; description: string; payment_method: string;
  status: "confirmed" | "approved" | "canceled"; original_amount_minor: number | null;
  currency_code: CurrencyCode | null; reported_krw_minor: number | null; evidence: Record<string, unknown>;
};
export function receiptMatchedActual(draft: TransactionDraft, drafts: TransactionDraft[], statements: StatementEvidence[], actuals: ActualRow[]) {
  if (draft.archived || draft.settled_actual_id || (!Array.isArray(draft.evidence?.items) && typeof draft.evidence?.receipt_hash !== "string")) return null;
  const matches = statements.filter(statement => statement.status === "confirmed" && sameReceiptPayment(draft, statement) &&
    (draft.statement_evidence_id === statement.id || isUniqueReceiptStatementPair(draft, statement, drafts, statements)))
    .flatMap(statement => {
      const statementDraft = drafts.find(row => row.source_key === `statement:${statement.source_key}`);
      const actual = statementDraft?.settled_actual_id ? actuals.find(row => row.id === statementDraft.settled_actual_id &&
        row.settlement_status === "settled" && !row.is_reversal && !row.correction_of_id && !row.replacement_of_id &&
        row.direction === draft.direction && row.original_amount_minor === draft.original_amount_minor && row.currency_code === draft.currency_code) : undefined;
      return actual ? [actual] : [];
    });
  return matches.length === 1 ? matches[0] : null;
}
export function visibleDrafts(drafts: TransactionDraft[], options: { showArchived: boolean; showCompleted: boolean; query: string }, actuals: ActualRow[] = [], statements: StatementEvidence[] = []) {
  const query = options.query.trim().toLowerCase();
  return drafts.filter(d => (options.showArchived || !d.archived) &&
    (options.showCompleted || (!d.settled_actual_id && !receiptMatchedActual(d, drafts, statements, actuals))) &&
    `${d.description} ${d.payment_method}`.toLowerCase().includes(query));
}
export function draftFields(input: { date: string; description: string; amount: string; currency: string; direction: string; paymentMethod: string; referenceKrw: string; notes: string }) {
  const date = new Date(`${input.date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== input.date ||
    !input.description.trim() || input.description.trim().length > 500 || !supportedCurrencies.includes(input.currency as CurrencyCode) ||
    !["inflow", "outflow"].includes(input.direction) || input.paymentMethod.length > 100 || input.notes.length > 2000) return null;
  const amount = parseAmountToMinor(input.amount, input.currency as CurrencyCode);
  const reference = input.referenceKrw.trim() ? parseAmountToMinor(input.referenceKrw, "KRW") : null;
  if (amount === null || amount <= BigInt(0) || safeMinorNumber(amount) === null || (input.referenceKrw.trim() && (reference === null || safeMinorNumber(reference) === null))) return null;
  return { occurred_on: input.date, description: input.description.trim(), original_amount_minor: Number(amount), currency_code: input.currency as CurrencyCode,
    direction: input.direction as "inflow" | "outflow", payment_method: input.paymentMethod.trim(), reference_krw_minor: reference === null ? null : Number(reference), notes: input.notes.trim() };
}
export function statementCandidates(draft: TransactionDraft, statements: StatementEvidence[]) {
  return statements.filter(row => row.status === "confirmed" && row.currency_code === draft.currency_code && row.original_amount_minor === draft.original_amount_minor &&
    Math.abs(Date.parse(row.occurred_on) - Date.parse(draft.occurred_on)) <= 3 * 86400000);
}
function hasReceiptEvidence(draft: TransactionDraft) {
  return typeof draft.evidence.receipt_hash === "string" || Array.isArray(draft.evidence.items);
}
function listedReceiptStatementCandidate(draft: TransactionDraft, statement: StatementEvidence) {
  const candidates = draft.evidence.candidate_source_keys;
  return Array.isArray(candidates) && candidates.includes(statement.source_key);
}
function sameReceiptPayment(draft: TransactionDraft, statement: StatementEvidence) {
  return statement.status !== "canceled" && statement.currency_code === draft.currency_code && statement.original_amount_minor === draft.original_amount_minor &&
    Math.abs(Date.parse(statement.occurred_on) - Date.parse(draft.occurred_on)) <= 3 * 86400000;
}
export function receiptCandidatesForStatement(statement: StatementEvidence, drafts: TransactionDraft[]) {
  return drafts.filter(draft => statement.status !== "canceled" && !draft.archived && draft.statement_evidence_id === null && hasReceiptEvidence(draft) &&
    (listedReceiptStatementCandidate(draft, statement) || sameReceiptPayment(draft, statement)));
}
export function receiptCandidatesForDraft(draft: TransactionDraft, statements: StatementEvidence[]) {
  return statements.filter(statement => statement.status !== "canceled" &&
    (listedReceiptStatementCandidate(draft, statement) || sameReceiptPayment(draft, statement)));
}
export function verifiedReceiptStatementMatch(draft: TransactionDraft, drafts: TransactionDraft[], statements: StatementEvidence[]) {
  if (!Array.isArray(draft.evidence.items)) return null;
  const candidates = receiptCandidatesForDraft(draft, statements).filter(statement =>
    statement.status !== "canceled" && sameReceiptPayment(draft, statement) &&
    isUniqueReceiptStatementPair(draft, statement, drafts, statements));
  return candidates.length === 1 ? candidates[0] : null;
}
export function statementRowsForReconciliation(statements: StatementEvidence[], drafts: TransactionDraft[], includeLinked = false) {
  return statements.filter(statement => {
    if (statement.status === "canceled") return false;
    const linked = drafts.some(draft => draft.statement_evidence_id === statement.id || draft.source_key === `statement:${statement.source_key}`);
    const verifiedReceiptMatch = drafts.some(draft => verifiedReceiptStatementMatch(draft, drafts, statements)?.id === statement.id);
    if ((linked || verifiedReceiptMatch) && !includeLinked) return false;
    return statement.status === "confirmed" || receiptCandidatesForStatement(statement, drafts).length > 0;
  });
}
export function isUniqueReceiptStatementPair(draft: TransactionDraft, statement: StatementEvidence, drafts: TransactionDraft[], statements: StatementEvidence[]) {
  // Candidate-source metadata and merchant strings are suggestions, not identity.
  // The payable receipt total is the purchase amount; OCR line-item sums can
  // legitimately differ because of discounts, tax, or omitted/misread lines.
  const receiptMatches = drafts.filter(row => !row.archived && !row.settled_actual_id && hasReceiptEvidence(row) && sameReceiptPayment(row, statement));
  const merchantReceipts = receiptMatches.filter(row => merchantAgrees(row.description, statement.description));
  const preferredReceipts = merchantReceipts.length ? merchantReceipts : receiptMatches;
  const statementMatches = statements.filter(row => row.status !== "canceled" && sameReceiptPayment(draft, row));
  const merchantStatements = statementMatches.filter(row => merchantAgrees(draft.description, row.description));
  const preferredStatements = merchantStatements.length ? merchantStatements : statementMatches;
  return preferredReceipts.length === 1 && preferredStatements.length === 1 && preferredReceipts[0].id === draft.id && preferredStatements[0].id === statement.id;
}
export function draftForSettlement(draft: TransactionDraft) {
  if (draft.archived || draft.settled_actual_id) return null;
  // A reference conversion is never an actual debit, even for a KRW account.
  return { date: draft.occurred_on, description: draft.description, originalAmountMinor: draft.original_amount_minor,
    originalCurrency: draft.currency_code, direction: draft.direction, accountId: draft.account_id,
    categoryId: draft.category_id, settlementAmount: "" };
}
