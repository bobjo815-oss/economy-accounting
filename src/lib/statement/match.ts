import type { ActualRow } from "../finance/records.ts";
import type { StatementEntry } from "./parse.ts";

export type StatementMatch = {
  entry: StatementEntry;
  status: "recorded" | "review" | "missing";
  actualId: string | null;
  reason: "merchant-and-amount" | "amount-and-date" | "multiple-candidates" | "duplicate-row" | "none";
};

function dayDistance(left: string, right: string) {
  const a = Date.parse(`${left}T00:00:00Z`), b = Date.parse(`${right}T00:00:00Z`);
  return Math.abs(a - b) / 86400000;
}

function merchantKey(value: string) {
  return value.toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\b(?:card|payment|purchase|pos|visa|mastercard|contactless)\b/g, " ").replace(/\s+/g, " ").trim();
}

function sameMerchant(left: string, right: string) {
  const a = merchantKey(left), b = merchantKey(right);
  return a.length >= 4 && b.length >= 4 && (a === b || a.includes(b) || b.includes(a));
}

function rowKey(row: StatementEntry) {
  return [row.date, row.direction, row.currency, row.amountMinor.toString(), merchantKey(row.description)].join("|");
}

export function reconcileStatement(entries: StatementEntry[], actuals: ActualRow[], accountId: string) {
  const reversedIds = new Set(actuals.filter((actual) => actual.correction_of_id).map((actual) => actual.correction_of_id));
  const eligibleActuals = actuals.filter((actual) => actual.account_id === accountId && actual.settlement_status === "settled" &&
    !actual.is_reversal && !reversedIds.has(actual.id));
  const candidates = entries.map((entry) => eligibleActuals.filter((actual) =>
    actual.direction === entry.direction && actual.settlement_currency === entry.currency &&
    BigInt(actual.settlement_amount_minor) === entry.amountMinor && dayDistance(actual.occurred_on, entry.date) <= 3,
  ));
  const duplicateRows = new Map<string, number>();
  for (const entry of entries) duplicateRows.set(rowKey(entry), (duplicateRows.get(rowKey(entry)) ?? 0) + 1);
  const candidateUse = new Map<string, number>();
  for (const list of candidates) for (const actual of list) candidateUse.set(actual.id, (candidateUse.get(actual.id) ?? 0) + 1);

  const matches: StatementMatch[] = entries.map((entry, index) => {
    const list = candidates[index];
    if ((duplicateRows.get(rowKey(entry)) ?? 0) > 1) {
      return { entry, status: "review", actualId: null, reason: "duplicate-row" };
    }
    const strong = list.filter((actual) => sameMerchant(entry.description, actual.description));
    if (list.length === 1 && strong.length === 1 && (candidateUse.get(strong[0].id) ?? 0) === 1) {
      return { entry, status: "recorded", actualId: strong[0].id, reason: "merchant-and-amount" };
    }
    if (list.length === 1 && (candidateUse.get(list[0].id) ?? 0) === 1) {
      return { entry, status: "review", actualId: list[0].id, reason: "amount-and-date" };
    }
    if (list.length) return { entry, status: "review", actualId: null, reason: "multiple-candidates" };
    return { entry, status: "missing", actualId: null, reason: "none" };
  });

  const linkedActualIds = new Set(candidates.flat().map((actual) => actual.id));
  const dates = entries.map((entry) => entry.date).sort();
  const from = dates[0], to = dates.at(-1);
  const ledgerOnly = from && to ? eligibleActuals.filter((actual) =>
    actual.occurred_on >= from && actual.occurred_on <= to && !linkedActualIds.has(actual.id),
  ) : [];
  return { matches, ledgerOnly };
}
