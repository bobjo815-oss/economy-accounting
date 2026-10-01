import { convertToBaseMinor } from "./money.ts";
import { planCosts } from "./plan-calculation.ts";
import { transferLegs } from "./transfer.ts";
import { paidOriginalMinor } from "./workflow.ts";
import type { AccountRow, ActualRow, CashDirection, EntryKind, WorkspaceData } from "./records.ts";

export function actualCashEffect(actual: ActualRow) {
  const amount = BigInt(actual.settlement_amount_minor);
  const fee = BigInt(actual.explicit_fee_minor);
  const effect = actual.direction === "inflow" ? amount - fee : -(amount + fee);
  return actual.is_reversal ? -effect : effect;
}

export function accountBalances(data: Pick<WorkspaceData, "accounts" | "actuals" | "transfers">, asOf?: string) {
  const balances = new Map(data.accounts.map((account) => [account.id, BigInt(account.opening_balance_minor)]));
  for (const actual of data.actuals) {
    if (actual.account_id && actual.settlement_status === "settled" && (!asOf || actual.occurred_on <= asOf)) {
      balances.set(actual.account_id, (balances.get(actual.account_id) ?? BigInt(0)) + actualCashEffect(actual));
    }
  }
  for (const transfer of data.transfers) {
    if (asOf && transfer.occurred_on > asOf) continue;
    for (const leg of transferLegs(transfer)) {
      balances.set(leg.accountId, (balances.get(leg.accountId) ?? BigInt(0)) + leg.amountMinor);
    }
  }
  return balances;
}

export type ForecastPoint = { date: string; title: string; effectMinor: bigint; closingMinor: bigint };

function addMonthsClamped(date: Date, months: number) {
  const targetFirst = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const targetLastDay = new Date(Date.UTC(targetFirst.getUTCFullYear(), targetFirst.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(targetFirst.getUTCFullYear(), targetFirst.getUTCMonth(), Math.min(date.getUTCDate(), targetLastDay)));
}

export function forecast(data: WorkspaceData, asOf: string, horizonMonths: 1 | 3 | 6 | 12, accountId: string | null) {
  const baseCurrency = data.profile?.base_currency ?? "KRW";
  const validAsOf = /^\d{4}-\d{2}-\d{2}$/.test(asOf) && !Number.isNaN(Date.parse(`${asOf}T00:00:00Z`))
    ? asOf : new Date().toISOString().slice(0, 10);
  const balances = accountBalances(data, validAsOf);
  const selectedAccounts: AccountRow[] = data.accounts.filter((account) =>
    account.is_active && account.currency_code === baseCurrency && (accountId === null || account.id === accountId));
  let closing = selectedAccounts.reduce((sum, account) => sum + (balances.get(account.id) ?? BigInt(0)), BigInt(0));
  const start = closing;
    const horizon = addMonthsClamped(new Date(`${validAsOf}T00:00:00Z`), horizonMonths);
  const lastDate = horizon.toISOString().slice(0, 10);
  const events: ForecastPoint[] = [];
  const eligible = data.plans.filter((plan) => plan.status !== "canceled" && plan.base_currency === baseCurrency &&
    plan.scheduled_date >= validAsOf && plan.scheduled_date <= lastDate &&
    (accountId === null ? (!plan.account_id || selectedAccounts.some((account) => account.id === plan.account_id)) : plan.account_id === accountId));
  for (const plan of eligible.sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))) {
    const remaining = BigInt(plan.original_amount_minor) - paidOriginalMinor(plan, data.actuals, validAsOf);
    if (remaining <= BigInt(0)) continue;
    const rate = data.rates.find((item) => item.id === plan.forecast_fx_snapshot_id)?.rate ?? null;
    const principal = plan.currency_code === plan.base_currency ? remaining :
      rate === null ? null : convertToBaseMinor(remaining, plan.currency_code, baseCurrency, rate);
    if (principal === null) continue;
    const planned = principal + BigInt(plan.forecast_fee_minor);
    const effect = plan.direction === "inflow" ? principal - BigInt(plan.forecast_fee_minor) : -planned;
    closing += effect;
    events.push({ date: plan.scheduled_date, title: plan.title, effectMinor: effect, closingMinor: closing });
  }
  return { openingMinor: start, closingMinor: closing, lowestMinor: events.reduce((low, point) => point.closingMinor < low ? point.closingMinor : low, start), events };
}

export function monthlyCategoryResults(data: WorkspaceData, month: string) {
  const baseCurrency = data.profile?.base_currency ?? "KRW";
  const totals = new Map<string, { plannedMinor: bigint; actualMinor: bigint }>();
  let unconvertedActuals = 0;
  for (const plan of data.plans) {
    if (plan.status === "canceled" || plan.direction !== "outflow" || plan.base_currency !== baseCurrency ||
      !plan.scheduled_date.startsWith(month)) continue;
    const cost = planCosts(plan, data.rates).forecast;
    if (cost === null) continue;
    const key = plan.category_id ?? "uncategorized";
    const total = totals.get(key) ?? { plannedMinor: BigInt(0), actualMinor: BigInt(0) };
    total.plannedMinor += cost;
    totals.set(key, total);
  }
  for (const actual of data.actuals) {
    if (actual.settlement_status !== "settled" || actual.direction !== "outflow" || !actual.occurred_on.startsWith(month)) continue;
    if (actual.settlement_currency !== baseCurrency) { unconvertedActuals++; continue; }
    const cost = -actualCashEffect(actual);
    const splits = data.splits.filter((split) => split.actual_transaction_id === actual.id);
    if (splits.length === 0) {
      const key = actual.category_id ?? "uncategorized";
      const total = totals.get(key) ?? { plannedMinor: BigInt(0), actualMinor: BigInt(0) };
      total.actualMinor += cost;
      totals.set(key, total);
    } else {
      let allocated = BigInt(0);
      for (const [index, split] of splits.entries()) {
        const portion = index === splits.length - 1 ? cost - allocated :
          cost * BigInt(split.original_amount_minor) / BigInt(actual.original_amount_minor);
        allocated += portion;
        const total = totals.get(split.category_id) ?? { plannedMinor: BigInt(0), actualMinor: BigInt(0) };
        total.actualMinor += portion;
        totals.set(split.category_id, total);
      }
    }
  }
  return { totals, unconvertedActuals };
}

export type MonthlyCompositionRow = {
  key: string;
  categoryId: string | null;
  entryKind: EntryKind;
  label: string | null;
  amountMinor: bigint;
};

/** Returns settled, base-currency cash composition without mixing currencies or double-counting corrections. */
export function monthlyActualComposition(data: WorkspaceData, month: string, direction: CashDirection, groupBy: "category" | "description" = "category") {
  const reversedIds = new Set(data.actuals.filter((actual) => actual.correction_of_id).map((actual) => actual.correction_of_id));
  const totals = new Map<string, MonthlyCompositionRow>();
  let unconvertedActuals = 0;
  for (const actual of data.actuals) {
    if (actual.is_reversal || reversedIds.has(actual.id) || actual.settlement_status !== "settled" ||
      actual.direction !== direction || !actual.occurred_on.startsWith(month)) continue;
    if (actual.settlement_currency !== (data.profile?.base_currency ?? "KRW")) {
      unconvertedActuals++;
      continue;
    }
    const amount = direction === "outflow"
      ? BigInt(actual.settlement_amount_minor) + BigInt(actual.explicit_fee_minor)
      : BigInt(actual.settlement_amount_minor) - BigInt(actual.explicit_fee_minor);
    if (amount <= BigInt(0)) continue;
    const splits = data.splits.filter((split) => split.actual_transaction_id === actual.id);
    const allocations = splits.length === 0
      ? [{ categoryId: actual.category_id, amountMinor: amount }]
      : splits.map((split, index) => ({
          categoryId: split.category_id,
          amountMinor: index === splits.length - 1
            ? amount - splits.slice(0, index).reduce((sum, prior) => sum + amount * BigInt(prior.original_amount_minor) / BigInt(actual.original_amount_minor), BigInt(0))
            : amount * BigInt(split.original_amount_minor) / BigInt(actual.original_amount_minor),
        }));
    for (const allocation of allocations) {
      const label = groupBy === "description" ? actual.description : null;
      const key = groupBy === "description" ? `description:${actual.description}` : `${allocation.categoryId ?? "uncategorized"}:${direction === "inflow" ? actual.entry_kind : "expense"}`;
      const current = totals.get(key) ?? { key, categoryId: allocation.categoryId, entryKind: actual.entry_kind, label, amountMinor: BigInt(0) };
      current.amountMinor += allocation.amountMinor;
      totals.set(key, current);
    }
  }
  return { rows: [...totals.values()].sort((a, b) => a.amountMinor > b.amountMinor ? -1 : a.amountMinor < b.amountMinor ? 1 : a.key.localeCompare(b.key)), unconvertedActuals };
}
