// Current ISO 4217 currency and fund codes with a numeric minor-unit precision.
// BGN, CUC, HRK, SLL, and ZWL are withdrawn; non-currency units with no minor
// unit are intentionally excluded. Keep this list in sync with the DB migration.
export const supportedCurrencies = [
  "AED", "AFN", "ALL", "AMD", "ANG", "AOA", "ARS", "AUD", "AWG", "AZN",
  "BAM", "BBD", "BDT", "BHD", "BIF", "BMD", "BND", "BOB", "BOV", "BRL",
  "BSD", "BTN", "BWP", "BYN", "BZD", "CAD", "CDF", "CHE", "CHF", "CHW",
  "CLF", "CLP", "CNY", "COP", "COU", "CRC", "CUP", "CVE", "CZK", "DJF",
  "DKK", "DOP", "DZD", "EGP", "ERN", "ETB", "EUR", "FJD", "FKP", "GBP",
  "GEL", "GHS", "GIP", "GMD", "GNF", "GTQ", "GYD", "HKD", "HNL", "HTG",
  "HUF", "IDR", "ILS", "INR", "IQD", "IRR", "ISK", "JMD", "JOD", "JPY",
  "KES", "KGS", "KHR", "KMF", "KPW", "KRW", "KWD", "KYD", "KZT", "LAK",
  "LBP", "LKR", "LRD", "LSL", "LYD", "MAD", "MDL", "MGA", "MKD", "MMK",
  "MNT", "MOP", "MRU", "MUR", "MVR", "MWK", "MXN", "MXV", "MYR", "MZN",
  "NAD", "NGN", "NIO", "NOK", "NPR", "NZD", "OMR", "PAB", "PEN", "PGK",
  "PHP", "PKR", "PLN", "PYG", "QAR", "RON", "RSD", "RUB", "RWF", "SAR",
  "SBD", "SCR", "SDG", "SEK", "SGD", "SHP", "SLE", "SOS", "SRD", "SSP",
  "STN", "SVC", "SYP", "SZL", "THB", "TJS", "TMT", "TND", "TOP", "TRY",
  "TTD", "TWD", "TZS", "UAH", "UGX", "USD", "USN", "UYU", "UYI", "UYW",
  "UZS", "VED", "VES", "VND", "VUV", "WST", "XAD", "XAF", "XCD", "XCG",
  "XOF", "XPF", "YER", "ZAR", "ZMW", "ZWG",
] as const;

export type CurrencyCode = (typeof supportedCurrencies)[number];

const zeroDecimalCurrencies = new Set<CurrencyCode>([
  "BIF", "CLP", "DJF", "GNF", "ISK", "JPY", "KMF", "KRW", "PYG", "RWF",
  "UGX", "UYI", "VND", "VUV", "XAF", "XOF", "XPF",
]);
const threeDecimalCurrencies = new Set<CurrencyCode>(["BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND"]);
const fourDecimalCurrencies = new Set<CurrencyCode>(["CLF", "UYW"]);

export function currencyFractionDigits(currency: CurrencyCode): number {
  if (zeroDecimalCurrencies.has(currency)) return 0;
  if (threeDecimalCurrencies.has(currency)) return 3;
  if (fourDecimalCurrencies.has(currency)) return 4;
  return 2;
}

export function minorUnitFactor(currency: CurrencyCode): bigint {
  return BigInt(10) ** BigInt(currencyFractionDigits(currency));
}

export function decimalAmountFromMinor(amountMinor: number, currency: CurrencyCode): string {
  const digits = currencyFractionDigits(currency);
  const amount = BigInt(amountMinor);
  const sign = amount < BigInt(0) ? "-" : "";
  const absolute = amount < BigInt(0) ? -amount : amount;
  const factor = minorUnitFactor(currency);
  const whole = (absolute / factor).toString();
  if (digits === 0) return `${sign}${whole}`;
  const fraction = (absolute % factor).toString().padStart(digits, "0");
  return `${sign}${whole}.${fraction}`;
}

export function currencyDisplayName(currency: CurrencyCode, locale = "en") {
  try {
    return new Intl.DisplayNames([locale], { type: "currency" }).of(currency) ?? currency;
  } catch {
    return currency;
  }
}

export const commonCurrencies = [
  "KRW", "GBP", "USD", "EUR", "JPY", "CNY", "CAD", "AUD", "CHF", "HKD",
  "SGD", "NZD", "INR", "BRL", "MXN", "THB", "TWD", "AED", "SAR", "VND",
  "ZAR", "IDR", "MYR", "PHP", "TRY", "PLN", "SEK", "NOK", "DKK", "CZK",
] as const satisfies readonly CurrencyCode[];

const rateScale = BigInt(100_000_000);

function decimalParts(value: string) {
  const match = value.trim().match(/^(\d+)(?:\.(\d+))?$/);
  if (!match) return null;
  return { whole: match[1], fraction: match[2] ?? "" };
}

export function parseAmountToMinor(value: string, currency: CurrencyCode): bigint | null {
  if (!supportedCurrencies.includes(currency)) return null;
  const parts = decimalParts(value);
  if (!parts) return null;

  const decimalPlaces = currencyFractionDigits(currency);
  if (parts.fraction.length > decimalPlaces) return null;

  const factor = minorUnitFactor(currency);
  const paddedFraction = parts.fraction.padEnd(decimalPlaces, "0");
  return BigInt(parts.whole) * factor + BigInt(paddedFraction || "0");
}

export function parseSignedAmountToMinor(value: string, currency: CurrencyCode): bigint | null {
  const trimmed = value.trim();
  const negative = trimmed.startsWith("-");
  const unsigned = parseAmountToMinor(negative ? trimmed.slice(1) : trimmed, currency);
  return unsigned === null ? null : negative ? -unsigned : unsigned;
}

export function safeMinorNumber(value: bigint): number | null {
  const converted = Number(value);
  return Number.isSafeInteger(converted) ? converted : null;
}

export function parseRate(value: string): bigint | null {
  const parts = decimalParts(value);
  if (!parts || parts.fraction.length > 8) return null;
  const scaled = BigInt(parts.whole) * rateScale + BigInt(parts.fraction.padEnd(8, "0"));
  return scaled > BigInt(0) ? scaled : null;
}

function divideAndRound(numerator: bigint, denominator: bigint) {
  return (numerator + denominator / BigInt(2)) / denominator;
}

/** Rate means one major source-currency unit equals N major base-currency units. */
export function convertToBaseMinor(
  amountMinor: bigint,
  sourceCurrency: CurrencyCode,
  baseCurrency: CurrencyCode,
  rate: string,
): bigint | null {
  if (sourceCurrency === baseCurrency) return amountMinor;
  const scaledRate = parseRate(rate);
  if (!scaledRate) return null;

  const numerator = amountMinor * scaledRate * minorUnitFactor(baseCurrency);
  const denominator = minorUnitFactor(sourceCurrency) * rateScale;
  return divideAndRound(numerator, denominator);
}

export function formatMinor(amountMinor: bigint, currency: CurrencyCode) {
  const sign = amountMinor < BigInt(0) ? "-" : "";
  const absolute = amountMinor < BigInt(0) ? -amountMinor : amountMinor;
  const divisor = minorUnitFactor(currency);
  const whole = (absolute / divisor).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const digits = currencyFractionDigits(currency);
  if (digits === 0) return `${sign}${whole} ${currency}`;
  const fraction = (absolute % divisor).toString().padStart(digits, "0");
  return `${sign}${whole}.${fraction} ${currency}`;
}
