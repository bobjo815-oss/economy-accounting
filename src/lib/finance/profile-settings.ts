import { parseAmountToMinor, safeMinorNumber, supportedCurrencies, type CurrencyCode } from "./money.ts";

export function parseProfileSettings(currency: string, safety: string, timezone: string) {
  if (!supportedCurrencies.includes(currency as CurrencyCode)) return null;
  const amount = parseAmountToMinor(safety, currency as CurrencyCode);
  if (amount === null || safeMinorNumber(amount) === null) return null;
  try { new Intl.DateTimeFormat("en", { timeZone: timezone }).format(); } catch { return null; }
  return { base_currency: currency as CurrencyCode, safety_balance_minor: Number(amount), timezone };
}
