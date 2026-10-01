import { parseRate, supportedCurrencies, type CurrencyCode } from "./money.ts";

const RATE_API = "https://api.frankfurter.dev/v2/rates";
const REFERENCE_DAYS = 31;

export type ReferenceRate = {
  rate: string;
  observedOn: string;
  sourceLabel: string;
};

type ApiRateRow = { date?: unknown; base?: unknown; quote?: unknown; rate?: unknown };

function previousWindowStart(date: string) {
  const end = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(end.getTime())) throw new Error("Invalid exchange-rate date.");
  end.setUTCDate(end.getUTCDate() - REFERENCE_DAYS);
  return end.toISOString().slice(0, 10);
}

export async function fetchReferenceRate(
  base: CurrencyCode,
  quote: CurrencyCode,
  asOf: string,
  signal?: AbortSignal,
): Promise<ReferenceRate> {
  if (!supportedCurrencies.includes(base) || !supportedCurrencies.includes(quote)) {
    throw new Error("Unsupported exchange-rate currency.");
  }
  if (base === quote) return { rate: "1", observedOn: asOf, sourceLabel: "Same currency" };

  const url = new URL(RATE_API);
  url.searchParams.set("base", base);
  url.searchParams.set("quotes", quote);
  url.searchParams.set("from", previousWindowStart(asOf));
  url.searchParams.set("to", asOf);
  const response = await fetch(url, { signal, cache: "no-store", headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("Reference exchange rate is unavailable.");
  const rows: unknown = await response.json();
  if (!Array.isArray(rows)) throw new Error("Unexpected reference exchange-rate response.");

  const valid = (rows as ApiRateRow[]).filter((row) =>
    typeof row.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(row.date) && row.date <= asOf &&
    row.base === base && row.quote === quote &&
    (typeof row.rate === "string" || typeof row.rate === "number") &&
    Number.isFinite(Number(row.rate)) && Number(row.rate) > 0,
  ).sort((left, right) => String(left.date).localeCompare(String(right.date)));
  const latest = valid.at(-1);
  if (!latest || typeof latest.date !== "string") throw new Error("No published rate was found for this date.");
  const rate = String(Number(latest.rate).toFixed(8)).replace(/\.?0+$/, "");
  if (!parseRate(rate)) throw new Error("The published rate is invalid.");
  return {
    rate,
    observedOn: latest.date,
    sourceLabel: "Frankfurter public blended mid-market reference rate",
  };
}
