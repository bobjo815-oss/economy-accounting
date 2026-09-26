export const supportedCurrencies = ["KRW", "GBP", "USD"] as const;

export type CurrencyCode = (typeof supportedCurrencies)[number];

const minorUnits: Record<CurrencyCode, bigint> = {
  KRW: BigInt(1),
  GBP: BigInt(100),
  USD: BigInt(100),
};

const rateScale = BigInt(100_000_000);

function decimalParts(value: string) {
  const match = value.trim().match(/^(\d+)(?:\.(\d+))?$/);
  if (!match) return null;
  return { whole: match[1], fraction: match[2] ?? "" };
}

export function parseAmountToMinor(value: string, currency: CurrencyCode): bigint | null {
  const parts = decimalParts(value);
  if (!parts) return null;

  const decimalPlaces = minorUnits[currency] === BigInt(1) ? 0 : 2;
  if (parts.fraction.length > decimalPlaces) return null;

  const paddedFraction = parts.fraction.padEnd(decimalPlaces, "0");
  return BigInt(parts.whole) * minorUnits[currency] + BigInt(paddedFraction || "0");
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

  const numerator = amountMinor * scaledRate * minorUnits[baseCurrency];
  const denominator = minorUnits[sourceCurrency] * rateScale;
  return divideAndRound(numerator, denominator);
}

export function formatMinor(amountMinor: bigint, currency: CurrencyCode) {
  const sign = amountMinor < BigInt(0) ? "-" : "";
  const absolute = amountMinor < BigInt(0) ? -amountMinor : amountMinor;
  const divisor = minorUnits[currency];
  const whole = (absolute / divisor).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (divisor === BigInt(1)) return `${sign}${whole} ${currency}`;
  const fraction = (absolute % divisor).toString().padStart(2, "0");
  return `${sign}${whole}.${fraction} ${currency}`;
}
