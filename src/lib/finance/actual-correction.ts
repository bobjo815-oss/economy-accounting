import { decimalAmountFromMinor, parseAmountToMinor, safeMinorNumber, supportedCurrencies, type CurrencyCode } from "./money.ts";
import type { ActualRow, WorkspaceData, EntryKind } from "./records.ts";

export type CorrectionFields = { date: string; description: string; amount: string; currency: string; accountId: string; settled: string; fee: string; categoryId: string; kind: EntryKind; planId: string; splits: { categoryId: string; amount: string }[] };
export function storedCorrectionFields(value: unknown): CorrectionFields | null {
  if (!value || typeof value !== "object") return null;
  const fields = value as Record<string,unknown>;
  if (!["date","description","amount","currency","accountId","settled","fee","categoryId","kind","planId"].every(key => typeof fields[key] === "string" && (fields[key] as string).length <= 2000)) return null;
  if (!Array.isArray(fields.splits) || fields.splits.length > 100 || fields.splits.some(s => !s || typeof s !== "object" || typeof s.categoryId !== "string" || typeof s.amount !== "string")) return null;
  return fields as unknown as CorrectionFields;
}
export function correctionFields(actual: ActualRow, data: WorkspaceData): CorrectionFields {
  const decimal = (minor: number, currency: CurrencyCode) => decimalAmountFromMinor(minor, currency);
  return { date: actual.occurred_on, description: actual.description, amount: decimal(actual.original_amount_minor, actual.currency_code), currency: actual.currency_code,
    accountId: actual.account_id ?? "", settled: decimal(actual.settlement_amount_minor, actual.settlement_currency), fee: decimal(actual.explicit_fee_minor, actual.settlement_currency),
    categoryId: actual.category_id ?? "", kind: actual.entry_kind, planId: actual.plan_id ?? "", splits: data.splits.filter(s => s.actual_transaction_id === actual.id).map(s => ({ categoryId: s.category_id, amount: decimal(s.original_amount_minor, actual.currency_code) })) };
}
export function correctionPayload(fields: CorrectionFields, data: WorkspaceData) {
  const account = data.accounts.find(a => a.id === fields.accountId && a.is_active);
  const date = new Date(`${fields.date}T00:00:00Z`);
  if (!account || !supportedCurrencies.includes(fields.currency as CurrencyCode) || !fields.description.trim() || fields.description.trim().length > 500 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(fields.date) || Number.isNaN(date.getTime()) || date.toISOString().slice(0,10) !== fields.date) return null;
  const amount = parseAmountToMinor(fields.amount, fields.currency as CurrencyCode);
  const settled = parseAmountToMinor(fields.settled, account.currency_code);
  const fee = parseAmountToMinor(fields.fee || "0", account.currency_code);
  const direction = ["income", "loan_drawdown"].includes(fields.kind) ? "inflow" : "outflow";
  if (!["income","expense","loan_drawdown","loan_principal","loan_interest"].includes(fields.kind) || amount === null || settled === null || fee === null || amount <= BigInt(0) || settled <= BigInt(0) || fee < BigInt(0) ||
    [amount,settled,fee].some(n => safeMinorNumber(n) === null) || (direction === "inflow" && fee > settled)) return null;
  const plan = data.plans.find(p => p.id === fields.planId);
  if (fields.planId && (!plan || plan.direction !== direction || plan.currency_code !== fields.currency || plan.base_currency !== account.currency_code)) return null;
  const splits = fields.splits.map(s => ({ category_id: s.categoryId, original_amount_minor: parseAmountToMinor(s.amount, fields.currency as CurrencyCode) }));
  const validCategory = (id: string) => data.categories.some(c => c.id === id && c.is_active && c.normal_direction === direction);
  if (fields.categoryId && !validCategory(fields.categoryId)) return null;
  if (splits.length && (splits.length < 2 || splits.some(s => !validCategory(s.category_id) || s.original_amount_minor === null || s.original_amount_minor <= BigInt(0)) || splits.reduce((sum,s) => sum + (s.original_amount_minor ?? BigInt(0)),BigInt(0)) !== amount)) return null;
  return { p_actual: { occurred_on: fields.date, description: fields.description.trim(), direction, entry_kind: fields.kind, account_id: fields.accountId, category_id: splits.length ? null : fields.categoryId || null,
    plan_id: fields.planId || null, original_amount_minor: Number(amount), currency_code: fields.currency, settlement_amount_minor: Number(settled), settlement_currency: account.currency_code,
    explicit_fee_minor: Number(fee), settlement_fx_snapshot_id: null }, p_splits: splits.map(s => ({ ...s, original_amount_minor: Number(s.original_amount_minor) })) };
}
