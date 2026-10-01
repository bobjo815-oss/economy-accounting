import type { WorkspaceData } from "./records.ts";

export function compareText(left: string, right: string, locale: string) {
  return left.localeCompare(right, locale, { numeric: true, sensitivity: "base" });
}

export function compareBigInt(left: bigint, right: bigint) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function sortRows<T>(rows: readonly T[], compare: (left: T, right: T) => number) {
  return rows.map((row, index) => ({ row, index }))
    .sort((left, right) => compare(left.row, right.row) || left.index - right.index)
    .map(({ row }) => row);
}

export type WorkspaceSortOrders = {
  actuals: string; plans: string; accounts: string; categories: string;
  recurring: string; transfers: string;
};

export function sortWorkspaceLists(data: WorkspaceData, order: WorkspaceSortOrders, locale: string): WorkspaceData {
  const byText = (left: string, right: string) => compareText(left, right, locale);
  const compareAmount = (direction: string, left: bigint, right: bigint) => direction === "amount-desc" || direction === "balance-desc"
    ? -compareBigInt(left, right) : compareBigInt(left, right);
  const plans = sortRows(data.plans, (a, b) => order.plans === "title" ? byText(a.title, b.title)
    : order.plans === "date-desc" ? byText(b.scheduled_date, a.scheduled_date)
      : order.plans === "amount-asc" || order.plans === "amount-desc" ? byText(a.currency_code, b.currency_code) || compareAmount(order.plans, BigInt(a.original_amount_minor), BigInt(b.original_amount_minor))
        : order.plans === "status" ? byText(a.status, b.status) : byText(a.scheduled_date, b.scheduled_date));
  const kindLabel = (kind: string) => locale === "ko" ? ({ expense: "지출", income: "수입", loan_drawdown: "대출 실행", loan_principal: "대출 원금 상환", loan_interest: "대출 이자" }[kind] ?? kind) : kind.replaceAll("_", " ");
  const actuals = sortRows(data.actuals, (a, b) => order.actuals === "description" ? byText(a.description, b.description)
    : order.actuals === "type" ? byText(kindLabel(a.entry_kind), kindLabel(b.entry_kind))
      : order.actuals === "date-asc" ? byText(a.occurred_on, b.occurred_on)
        : order.actuals === "amount-asc" || order.actuals === "amount-desc" ? byText(a.settlement_currency, b.settlement_currency) || compareAmount(order.actuals, BigInt(a.settlement_amount_minor) + BigInt(a.explicit_fee_minor), BigInt(b.settlement_amount_minor) + BigInt(b.explicit_fee_minor))
          : byText(b.occurred_on, a.occurred_on));
  const accounts = sortRows(data.accounts, (a, b) => order.accounts === "currency" ? byText(a.currency_code, b.currency_code) || byText(a.name, b.name)
    : order.accounts === "balance-asc" || order.accounts === "balance-desc" ? byText(a.currency_code, b.currency_code) || compareAmount(order.accounts, BigInt(a.opening_balance_minor), BigInt(b.opening_balance_minor))
      : byText(a.name, b.name));
  const categories = sortRows(data.categories, (a, b) => order.categories === "direction" ? byText(a.normal_direction, b.normal_direction) || byText(a.major_name, b.major_name)
    : order.categories === "group" ? byText(a.major_name, b.major_name) || byText(a.name, b.name)
      : byText(a.name, b.name) || byText(a.major_name, b.major_name));
  const recurringTemplates = sortRows(data.recurringTemplates, (a, b) => order.recurring === "title" ? byText(a.title, b.title)
    : order.recurring === "amount-asc" || order.recurring === "amount-desc" ? byText(a.currency_code, b.currency_code) || compareAmount(order.recurring, BigInt(a.original_amount_minor), BigInt(b.original_amount_minor))
      : order.recurring === "cadence" ? byText(a.cadence, b.cadence) : byText(a.next_date, b.next_date));
  const currencyOfAccount = (id: string) => data.accounts.find((account) => account.id === id)?.currency_code ?? "ZZZ";
  const transfers = sortRows(data.transfers, (a, b) => order.transfers === "description" ? byText(a.description, b.description)
    : order.transfers === "amount-asc" || order.transfers === "amount-desc" ? byText(currencyOfAccount(a.from_account_id), currencyOfAccount(b.from_account_id)) || byText(a.from_account_id, b.from_account_id) || compareAmount(order.transfers, BigInt(a.from_amount_minor), BigInt(b.from_amount_minor))
      : order.transfers === "date-asc" ? byText(a.occurred_on, b.occurred_on) : byText(b.occurred_on, a.occurred_on));
  return { ...data, actuals, plans, accounts, categories, recurringTemplates, transfers };
}
