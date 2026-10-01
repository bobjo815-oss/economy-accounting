import type { CurrencyCode } from "@/lib/finance/money";

export type ReceiptDraft = {
  merchant: string | null;
  date: string | null;
  total: string | null;
  currency: CurrencyCode | null;
  items: string[];
};

const moneyPattern = /(?:[$£₩]\s*)?\d{1,3}(?:[,. ]\d{3})*(?:[,.]\d{1,2})?|(?:[$£₩]\s*)?\d+(?:[,.]\d{1,2})?/g;
const totalLabel = /(?:grand\s+total|total\s+(?:due|to\s+pay)|amount\s+due|balance\s+(?:due|before\s+deductions)|sale\s+total|total|amount|합계|총액|결제금액|받을\s*금액|청구금액)/i;
const paymentLabel = /(?:^|\s)(?:card|paid|payment)(?:\s|$)|카드\s*결제|결제\s*완료/i;
const excludedItemLine = /(?:sub.?total|grand\s+total|total|balance|paid|payment|tax|vat|change|cash|card|credit|discount|offer|합계|총액|잔액|결제|부가세|세금|카드|현금|거스름돈|할인|승인|전화|tel|www\.|@)/i;

function currencyIn(value: string): CurrencyCode | null {
  return /£|\bGBP\b|파운드/i.test(value) ? "GBP"
    : /₩|\bKRW\b|원\b|원화/i.test(value) ? "KRW"
      : /\bUSD\b|\$/.test(value) ? "USD" : null;
}

function normalizeAmount(value: string): string | null {
  let cleaned = value.replace(/[^\d,.]/g, "");
  if (!cleaned || !/\d/.test(cleaned)) return null;
  const comma = cleaned.lastIndexOf(",");
  const dot = cleaned.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    const decimalSeparator = comma > dot ? "," : ".";
    const groupSeparator = decimalSeparator === "," ? "." : ",";
    cleaned = cleaned.split(groupSeparator).join("");
    if (decimalSeparator === ",") cleaned = cleaned.replace(",", ".");
  } else if (comma >= 0) {
    const decimals = cleaned.length - comma - 1;
    cleaned = decimals > 0 && decimals <= 2 ? cleaned.replace(",", ".") : cleaned.replace(/,/g, "");
  } else if (dot >= 0) {
    const decimals = cleaned.length - dot - 1;
    if (decimals > 2) cleaned = cleaned.replace(/\./g, "");
  }
  const amount = Number(cleaned);
  return Number.isFinite(amount) && amount > 0 ? cleaned : null;
}

function findDate(lines: string[]): string | null {
  for (const line of lines) {
    const yearFirst = line.match(/\b(20\d{2})\s*[-/.년]\s*(\d{1,2})\s*[-/.월]\s*(\d{1,2})\s*(?:일)?/);
    if (yearFirst) {
      const [, year, month, day] = yearFirst;
      const candidate = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
      if (validDate(candidate)) return candidate;
    }
    const namedMonth = line.match(/\b(\d{1,2})\s*[-/. ]?\s*(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*\s*[-/. ]?\s*(20\d{2}|\d{2})\b/i);
    if (namedMonth) {
      const month = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"].indexOf(namedMonth[2].toUpperCase()) + 1;
      const year = namedMonth[3].length === 2 ? `20${namedMonth[3]}` : namedMonth[3];
      const candidate = `${year}-${String(month).padStart(2, "0")}-${namedMonth[1].padStart(2, "0")}`;
      if (validDate(candidate)) return candidate;
    }
    const dayFirst = line.match(/\b(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(20\d{2}|\d{2})\b/);
    if (dayFirst) {
      const [, first, second, rawYear] = dayFirst;
      const a = Number(first), b = Number(second);
      if (a <= 12 && b <= 12) continue;
      const day = a > 12 ? a : b;
      const month = a > 12 ? b : a;
      const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
      const candidate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      if (validDate(candidate)) return candidate;
    }
  }
  return null;
}

function validDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function parseReceiptText(rawText: string): ReceiptDraft {
  const lines = rawText.split(/\r?\n/).map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
  const merchant = lines.slice(0, 8).find((line) =>
    line.length >= 2 && line.length <= 80 && !totalLabel.test(line) && !/receipt|invoice|영수증|사업자/i.test(line) && !/\d{2,}[\s-]*\d{2,}/.test(line) &&
    !/\b20\d{2}\b/.test(line) && !/^[\d\s.,:/()-]+$/.test(line),
  ) ?? null;
  const candidates = lines.filter((line) => (totalLabel.test(line) || paymentLabel.test(line)) && !/sub.?total|cash\s+tendered|change|refund/i.test(line));
  const labeledTotal = candidates.filter((line) => totalLabel.test(line)).at(-1);
  const payment = candidates.filter((line) => paymentLabel.test(line)).at(-1);
  const totalCurrency = labeledTotal ? currencyIn(labeledTotal) : null;
  const paymentCurrency = payment ? currencyIn(payment) : null;
  const totalLine = payment && (!labeledTotal || !totalCurrency || !paymentCurrency || totalCurrency === paymentCurrency) && candidates.indexOf(payment) > candidates.indexOf(labeledTotal ?? "") ? payment : labeledTotal ?? payment;
  const amounts = totalLine ? [...totalLine.matchAll(moneyPattern)] : [];
  let total = amounts.length ? normalizeAmount(amounts.at(-1)?.[0] ?? "") : null;
  let currency = totalLine ? currencyIn(totalLine) ?? currencyIn(rawText) : currencyIn(rawText);
  if (!totalLine) {
    const printedPrices = lines.filter((line) => !/change|refund|discount|offer|saving|할인|거스름돈/i.test(line))
      .flatMap((line) => [...line.matchAll(/[£$₩]\s*\d+(?:[,.]\d{1,3})*/g)]
        .map((match) => ({ amount: normalizeAmount(match[0]), currency: currencyIn(match[0]) })));
    const distinct = [...new Map(printedPrices.filter((price) => price.amount && price.currency)
      .map((price) => [`${price.currency}:${price.amount}`, price])).values()];
    if (distinct.length === 1) {
      total = distinct[0].amount;
      currency = distinct[0].currency;
    }
  }
  const items = lines.flatMap((line) => {
    if (excludedItemLine.test(line) || /^\d{2,4}[-/.]/.test(line) || /\b\d{1,2}\s*[-/. ]?\s*(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*\s*[-/. ]?\s*\d{2,4}\b/i.test(line)) return [];
    const matches = [...line.matchAll(moneyPattern)];
    if (!matches.length) return [];
    const name = line.slice(0, matches.at(-1)?.index ?? 0).replace(/[x×]\s*\d+\s*$/i, "").trim();
    return name.length >= 2 && name.length <= 120 && !/^\d+$/.test(name) ? [name] : [];
  }).slice(0, 40);

  return { merchant, date: findDate(lines), total, currency, items };
}
