import { minorUnitFactor, parseSignedAmountToMinor, safeMinorNumber, type CurrencyCode } from "./money.ts";

export type DebitConfirmation = { statement_evidence_id: string; amount_krw_minor: number };
export function effectiveKrwRate(original: number, currency: CurrencyCode, debit: number) {
  if (!Number.isSafeInteger(original) || original <= 0 || !Number.isSafeInteger(debit) || debit <= 0) return null;
  const scale = BigInt(100000000);
  const rate = (BigInt(debit) * minorUnitFactor(currency) * scale + BigInt(original) / BigInt(2)) / BigInt(original);
  return `${rate / scale}.${String(rate % scale).padStart(8, "0")}`;
}
export function receiptField(value: unknown): string {
  if (value == null) return "";
  if (typeof value !== "object") return String(value);
  const field = value as Record<string, unknown>;
  const money = field.valueCurrency as { amount?: unknown } | undefined;
  return String(money?.amount ?? field.valueString ?? field.valueNumber ?? field.content ?? "");
}
export type ReceiptItemTotal = { amountMinor: number | null; itemCount: number; missingAmountCount: number };
/** Sums receipt line totals, including negative discounts, without mutating OCR evidence. */
export function receiptItemTotal(items: unknown[], currency: CurrencyCode): ReceiptItemTotal {
  let total = BigInt(0);
  let missingAmountCount = 0;
  for (const item of items) {
    const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const raw = receiptField(row.TotalPrice).replace(/[,£$₩\s]/g, "");
    const amount = raw ? parseSignedAmountToMinor(raw, currency) : null;
    if (amount === null) missingAmountCount++;
    else total += amount;
  }
  return { amountMinor: safeMinorNumber(total), itemCount: items.length, missingAmountCount };
}
/** Derived display only: largest-remainder allocation; never creates ledger rows. */
export function allocateReceiptItems(items: unknown[], original: number, currency: CurrencyCode, debit: number) {
  if (!effectiveKrwRate(original, currency, debit) || !items.length) return null;
  if (items.length === 1 && items[0] && typeof items[0] === "object") {
    const item = items[0] as Record<string, unknown>;
    const value = parseSignedAmountToMinor(receiptField(item.TotalPrice).replace(/[,£$₩\s]/g, ""), currency);
    if (value !== null && value <= BigInt(0)) return null;
    return [{ label: receiptField(item.Description) || "—", unitemized: false, sourceIndex: 0, amountKrw: debit }];
  }
  const rows: { label: string; weight: bigint; unitemized: boolean; sourceIndex: number | null }[] = [];
  let missing = false;
  for (const [sourceIndex, item] of items.entries()) {
    const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const amount = parseSignedAmountToMinor(receiptField(row.TotalPrice).replace(/[,£$₩\s]/g, ""), currency);
    if (amount === null) { missing = true; continue; }
    // Negative discounts are already in the confirmed payable total, not extra spending.
    if (amount <= BigInt(0)) continue;
    rows.push({ label: receiptField(row.Description) || "—", weight: amount, unitemized: false, sourceIndex });
  }
  if (!rows.length) return null;
  let total = rows.reduce((sum,row) => sum + row.weight, BigInt(0));
  if (total < BigInt(original)) {
    rows.push({ label: "Unitemized remainder", weight: BigInt(original) - total, unitemized: true, sourceIndex: null });
    total = BigInt(original);
  } else if (missing && total > BigInt(original)) return null;
  const allocated = rows.map((row,index) => ({ ...row, index, amount: BigInt(debit) * row.weight / total, remainder: BigInt(debit) * row.weight % total }));
  const remaining = BigInt(debit) - allocated.reduce((sum,row) => sum + row.amount, BigInt(0));
  const ranked = [...allocated].sort((a,b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1);
  for (let i = 0; i < Number(remaining); i++) ranked[i].amount += BigInt(1);
  return allocated.map(row => ({ label: row.label, unitemized: row.unitemized, sourceIndex: row.sourceIndex, amountKrw: safeMinorNumber(row.amount)! }));
}
function merchantKey(value: string) {
  return value.normalize("NFKC").toLowerCase().split(/[^a-z0-9가-힣]+/)
    .map(token => token.length > 4 && token.endsWith("s") ? token.slice(0, -1) : token)
    .filter(token => token.length >= 3 && !["limited", "ltd", "shop", "store", "supermarket", "sheffield", "branch"].includes(token));
}
export function merchantAgrees(left: string, right: string) {
  const a = merchantKey(left), b = new Set(merchantKey(right));
  return a.some(token => b.has(token) || [...b].some(other => token.length >= 5 && other.length >= 5 && (token.startsWith(other) || other.startsWith(token))));
}
