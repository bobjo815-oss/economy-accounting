import { parseAmountToMinor, safeMinorNumber, supportedCurrencies, type CurrencyCode } from "../finance/money.ts";
import type { CashDirection } from "../finance/records.ts";

export type StatementCell = string | number | boolean | Date | null;
export type StatementTable = { name: string; rows: StatementCell[][] };
export type StatementMapping = {
  headerRow: number;
  dateColumn: number;
  descriptionColumn: number;
  amountMode: "signed" | "debit-credit";
  amountColumn: number;
  debitColumn: number;
  creditColumn: number;
  currencyColumn: number;
  dateOrder: "DMY" | "MDY";
  positiveMeans: CashDirection;
};
export type StatementEntry = {
  sourceRow: number;
  date: string;
  description: string;
  direction: CashDirection;
  amountMinor: bigint;
  currency: CurrencyCode;
};
export type StatementIssue = { sourceRow: number; reason: "date" | "description" | "amount" | "currency" };

const MAX_STATEMENT_ROWS = 3000;

function countDelimiters(line: string, delimiter: string) {
  let count = 0;
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] === '"') {
      if (quoted && line[index + 1] === '"') index += 1;
      else quoted = !quoted;
    } else if (line[index] === delimiter && !quoted) count += 1;
  }
  return count;
}

export function parseCsv(text: string): StatementTable {
  const sample = text.replace(/^\uFEFF/, "").split(/\r?\n/).slice(0, 8);
  const delimiter = [",", "\t", ";"].sort((left, right) =>
    sample.reduce((sum, line) => sum + countDelimiters(line, right), 0) - sample.reduce((sum, line) => sum + countDelimiters(line, left), 0),
  )[0];
  const rows: StatementCell[][] = [];
  let row: StatementCell[] = [];
  let value = "";
  let quoted = false;
  const input = text.replace(/^\uFEFF/, "");
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (character === '"') {
      if (quoted && input[index + 1] === '"') { value += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === delimiter && !quoted) {
      row.push(value.trim()); value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && input[index + 1] === "\n") index += 1;
      row.push(value.trim()); value = "";
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
      if (rows.length > MAX_STATEMENT_ROWS + 12) throw new Error("Statement files are limited to 3,000 transaction rows.");
    } else {
      value += character;
    }
  }
  if (quoted) throw new Error("The CSV file has an unfinished quoted field.");
  row.push(value.trim());
  if (row.some((cell) => cell !== "")) rows.push(row);
  if (rows.length > MAX_STATEMENT_ROWS + 12) throw new Error("Statement files are limited to 3,000 transaction rows.");
  return { name: "CSV", rows };
}

const headerPatterns = {
  date: /^(?:transaction\s*date|posting\s*date|purchase\s*date|date|거래일(?:자|시)?|승인일(?:자|시)?|이용일(?:자|시)?|사용일(?:자|시)?|매입일(?:자|시)?)$/i,
  description: /^(?:description|details?|merchant|payee|narrative|reference|거래내역|사용처|가맹점명?|적요|내용)$/i,
  amount: /^(?:amount|transaction\s*amount|card\s*amount|결제금액|거래금액|이용금액|사용금액|금액)$/i,
  debit: /^(?:debit|withdrawal|money\s*out|출금(?:액)?|지출(?:액)?|차변)$/i,
  credit: /^(?:credit|deposit|money\s*in|입금(?:액)?|수입(?:액)?|대변)$/i,
  currency: /^(?:currency|currency\s*code|통화|통화코드)$/i,
};

export function suggestMapping(rows: StatementCell[][], headerRow = 0): StatementMapping {
  const headers = (rows[headerRow] ?? []).map((cell) => String(cell ?? "").trim());
  const find = (pattern: RegExp) => headers.findIndex((header) => pattern.test(header));
  const debit = find(headerPatterns.debit);
  const credit = find(headerPatterns.credit);
  return {
    headerRow,
    dateColumn: find(headerPatterns.date),
    descriptionColumn: find(headerPatterns.description),
    amountMode: debit >= 0 || credit >= 0 ? "debit-credit" : "signed",
    amountColumn: find(headerPatterns.amount),
    debitColumn: debit,
    creditColumn: credit,
    currencyColumn: find(headerPatterns.currency),
    dateOrder: "DMY",
    positiveMeans: "outflow",
  };
}

function validDate(year: number, month: number, day: number): string | null {
  const candidate = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const date = new Date(`${candidate}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === candidate ? candidate : null;
}

export function parseStatementDate(value: StatementCell, order: "DMY" | "MDY"): string | null {
  if (value instanceof Date) return validDate(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  if (typeof value === "number" && Number.isInteger(value) && value >= 20000 && value <= 100000) {
    const date = new Date(Date.UTC(1899, 11, 30) + value * 86400000);
    return validDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  }
  const text = String(value ?? "").trim();
  const iso = text.match(/^(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s]|$)/);
  if (iso) return validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const local = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2}|\d{2})(?:\s|$)/);
  if (!local) return null;
  const first = Number(local[1]), second = Number(local[2]);
  const year = local[3].length === 2 ? 2000 + Number(local[3]) : Number(local[3]);
  return order === "DMY" ? validDate(year, second, first) : validDate(year, first, second);
}

function parseMoney(value: StatementCell, currency: CurrencyCode): bigint | null {
  if (value === null || value === "") return null;
  const raw = String(value).trim();
  const negative = /^[-−]/.test(raw) || /[-−]$/.test(raw) || /^\(.*\)$/.test(raw);
  let digits = raw.replace(/[^\d.,]/g, "");
  if (!digits) return null;
  const comma = digits.lastIndexOf(","), dot = digits.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    const decimal = comma > dot ? "," : ".";
    digits = digits.replace(decimal === "," ? /\./g : /,/g, "");
    if (decimal === ",") digits = digits.replace(",", ".");
  } else if (comma >= 0) {
    const decimals = digits.length - comma - 1;
    digits = decimals > 0 && decimals <= 2 ? digits.replace(/\./g, "").replace(",", ".") : digits.replace(/,/g, "");
  } else if (dot >= 0 && digits.length - dot - 1 > 2) {
    digits = digits.replace(/\./g, "");
  }
  const parsed = parseAmountToMinor(digits, currency);
  return parsed === null ? null : negative ? -parsed : parsed;
}

export function parseStatementRows(rows: StatementCell[][], mapping: StatementMapping, accountCurrency: CurrencyCode): {
  entries: StatementEntry[]; issues: StatementIssue[];
} {
  const entries: StatementEntry[] = [], issues: StatementIssue[] = [];
  for (let index = mapping.headerRow + 1; index < rows.length; index += 1) {
    const cells = rows[index];
    if (!cells?.some((cell) => cell !== null && String(cell).trim())) continue;
    const sourceRow = index + 1;
    const date = parseStatementDate(cells[mapping.dateColumn] ?? null, mapping.dateOrder);
    const description = String(cells[mapping.descriptionColumn] ?? "").trim();
    if (!date) { issues.push({ sourceRow, reason: "date" }); continue; }
    if (!description) { issues.push({ sourceRow, reason: "description" }); continue; }
    const fileCurrency = mapping.currencyColumn >= 0 ? String(cells[mapping.currencyColumn] ?? "").trim().toUpperCase() || accountCurrency : accountCurrency;
    if (!supportedCurrencies.includes(fileCurrency as CurrencyCode) || fileCurrency !== accountCurrency) {
      issues.push({ sourceRow, reason: "currency" }); continue;
    }
    let amount: bigint | null = null;
    let direction: CashDirection = "outflow";
    if (mapping.amountMode === "signed") {
      const rawAmount = cells[mapping.amountColumn] ?? null;
      amount = parseMoney(rawAmount, accountCurrency);
      if (amount !== null) {
        direction = amount < BigInt(0) ? (mapping.positiveMeans === "outflow" ? "inflow" : "outflow") : mapping.positiveMeans;
        if (/\bDR\b/i.test(String(rawAmount))) direction = "outflow";
        if (/\bCR\b/i.test(String(rawAmount))) direction = "inflow";
        if (amount < BigInt(0)) amount = -amount;
      }
    } else {
      const debit = mapping.debitColumn >= 0 ? parseMoney(cells[mapping.debitColumn] ?? null, accountCurrency) : null;
      const credit = mapping.creditColumn >= 0 ? parseMoney(cells[mapping.creditColumn] ?? null, accountCurrency) : null;
      if (debit && !credit) { amount = debit < BigInt(0) ? -debit : debit; direction = "outflow"; }
      else if (credit && !debit) { amount = credit < BigInt(0) ? -credit : credit; direction = "inflow"; }
    }
    if (!amount || amount <= BigInt(0) || safeMinorNumber(amount) === null) {
      issues.push({ sourceRow, reason: "amount" }); continue;
    }
    entries.push({ sourceRow, date, description, direction, amountMinor: amount, currency: accountCurrency });
  }
  return { entries, issues };
}
