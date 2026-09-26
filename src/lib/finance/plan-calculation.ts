import { convertToBaseMinor, type CurrencyCode } from "./money.ts";
import type { FxSnapshotRow, PlanRow } from "./records.ts";

export function planAmountInBaseMinor(
  amountMinor: bigint,
  currency: CurrencyCode,
  baseCurrency: CurrencyCode,
  rate: string | null,
  feeMinor: bigint,
): bigint | null {
  if (currency !== baseCurrency && rate === null) return null;
  const converted = convertToBaseMinor(amountMinor, currency, baseCurrency, rate ?? "1");
  return converted === null ? null : converted + feeMinor;
}

export function planCosts(plan: PlanRow, rates: FxSnapshotRow[]) {
  const baselineRate = rates.find((rate) => rate.id === plan.baseline_fx_snapshot_id)?.rate ?? null;
  const forecastRate = rates.find((rate) => rate.id === plan.forecast_fx_snapshot_id)?.rate ?? null;
  const amount = BigInt(plan.original_amount_minor);
  return {
    baseline: planAmountInBaseMinor(amount, plan.currency_code, plan.base_currency, baselineRate, BigInt(plan.baseline_fee_minor)),
    forecast: planAmountInBaseMinor(amount, plan.currency_code, plan.base_currency, forecastRate, BigInt(plan.forecast_fee_minor)),
  };
}
