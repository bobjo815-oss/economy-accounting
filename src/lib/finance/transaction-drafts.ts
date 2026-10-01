import { parseAmountToMinor, safeMinorNumber, supportedCurrencies, type CurrencyCode } from "./money.ts";

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
export function visibleDrafts(drafts: TransactionDraft[], options: { showArchived: boolean; showCompleted: boolean; query: string }) {
  const query = options.query.trim().toLowerCase();
  return drafts.filter(d => (options.showArchived || !d.archived) &&
    (options.showCompleted || !d.settled_actual_id) &&
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
export function draftForSettlement(draft: TransactionDraft) {
  if (draft.archived || draft.settled_actual_id) return null;
  // A reference conversion is never an actual debit, even for a KRW account.
  return { date: draft.occurred_on, description: draft.description, originalAmountMinor: draft.original_amount_minor,
    originalCurrency: draft.currency_code, direction: draft.direction, accountId: draft.account_id,
    categoryId: draft.category_id, settlementAmount: "" };
}
