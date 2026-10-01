"use client";

import { useMemo, useState, type ChangeEvent } from "react";
import { formatMinor } from "@/lib/finance/money";
import type { AccountRow, ActualRow } from "@/lib/finance/records";
import { useLanguage } from "@/lib/i18n/provider";
import { reconcileStatement } from "@/lib/statement/match";
import { parseStatementRows, suggestMapping, type StatementEntry, type StatementMapping, type StatementTable } from "@/lib/statement/parse";
import { readStatementFile } from "@/lib/statement/read-file";

type Props = {
  accounts: AccountRow[];
  actuals: ActualRow[];
  blocked: boolean;
  onApply: (entry: StatementEntry, accountId: string, onSaved: () => void, onCancelled: () => void) => boolean;
};

const pageSize = 40;

export default function StatementImporter({ accounts, actuals, blocked, onApply }: Props) {
  const { locale, t } = useLanguage();
  const text = (ko: string, en: string) => locale === "ko" ? ko : en;
  const [tables, setTables] = useState<StatementTable[]>([]);
  const [fileName, setFileName] = useState("");
  const [sheetIndex, setSheetIndex] = useState(0);
  const [mapping, setMapping] = useState<StatementMapping | null>(null);
  const [accountId, setAccountId] = useState("");
  const [encoding, setEncoding] = useState<"utf-8" | "euc-kr" | "windows-1252">("utf-8");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [page, setPage] = useState(0);
  const [activeRow, setActiveRow] = useState<number | null>(null);
  const [savedRows, setSavedRows] = useState<number[]>([]);
  const [confirmedRows, setConfirmedRows] = useState<number[]>([]);

  const account = accounts.find((item) => item.id === accountId);
  const table = tables[sheetIndex];
  const headers = table?.rows[mapping?.headerRow ?? 0] ?? [];
  const columnCount = Math.min(60, Math.max(headers.length, ...((table?.rows ?? []).slice(0, 10).map((row) => row.length)), 0));
  const columns = Array.from({ length: columnCount }, (_, index) => ({
    value: index, label: `${index + 1}. ${String(headers[index] ?? "").trim() || text("제목 없음", "Untitled")}`,
  }));
  const mapped = Boolean(account && table && mapping && mapping.dateColumn >= 0 && mapping.descriptionColumn >= 0 &&
    (mapping.amountMode === "signed" ? mapping.amountColumn >= 0 : mapping.debitColumn >= 0 || mapping.creditColumn >= 0));
  const parsed = useMemo(() => mapped && account && table && mapping ?
    parseStatementRows(table.rows, mapping, account.currency_code) : { entries: [], issues: [] },
  [mapped, account, table, mapping]);
  const reconciliation = useMemo(() => account ? reconcileStatement(parsed.entries, actuals, account.id) : { matches: [], ledgerOnly: [] },
    [parsed.entries, actuals, account]);
  const visible = reconciliation.matches.filter((item) => showAll || item.status !== "recorded");
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const pageRows = visible.slice(Math.min(page, pageCount - 1) * pageSize, (Math.min(page, pageCount - 1) + 1) * pageSize);
  const recordedCount = reconciliation.matches.filter((item) => item.status === "recorded").length;
  const reviewCount = reconciliation.matches.filter((item) => item.status === "review").length;
  const missingCount = reconciliation.matches.filter((item) => item.status === "missing").length;

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setLoading(true); setError(""); setTables([]); setMapping(null); setFileName("");
    setActiveRow(null); setSavedRows([]); setConfirmedRows([]); setPage(0);
    try {
      const loaded = await readStatementFile(file, encoding);
      if (!loaded.length || !loaded.some((item) => item.rows.length > 1)) throw new Error("No transaction rows were found in this file.");
      setTables(loaded);
      setFileName(file.name);
      setSheetIndex(0);
      setMapping(suggestMapping(loaded[0].rows));
      if (!accountId && accounts.length === 1) setAccountId(accounts[0].id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The statement could not be read.");
    } finally { setLoading(false); }
  }

  function updateMapping(patch: Partial<StatementMapping>) {
    setMapping((current) => current ? { ...current, ...patch } : current);
    setPage(0); setConfirmedRows([]); setSavedRows([]);
  }

  function columnField(label: string, key: "dateColumn" | "descriptionColumn" | "amountColumn" | "debitColumn" | "creditColumn" | "currencyColumn") {
    return <label className="text-xs font-medium text-slate-700">{label}
      <select value={mapping?.[key] ?? -1} onChange={(event) => updateMapping({ [key]: Number(event.target.value) })} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm">
        <option value={-1}>{text("열 선택", "Choose column")}</option>
        {columns.map((column) => <option key={column.value} value={column.value}>{column.label}</option>)}
      </select>
    </label>;
  }

  function applyEntry(entry: StatementEntry) {
    if (blocked || activeRow !== null || !account) return;
    const accepted = onApply(entry, account.id, () => {
      setSavedRows((current) => [...current, entry.sourceRow]);
      setActiveRow(null);
    }, () => setActiveRow(null));
    if (accepted) setActiveRow(entry.sourceRow);
  }

  const reason = (value: string) => ({
    date: text("날짜를 읽지 못함", "Date could not be read"),
    description: text("내용이 없음", "Description missing"),
    amount: text("금액을 읽지 못함", "Amount could not be read"),
    currency: text("선택 계좌와 통화가 다름", "Currency differs from selected account"),
  }[value] ?? value);

  return <section className="sm:col-span-2 lg:col-span-4 rounded-xl border border-dashed border-blue-300 bg-blue-50/60 p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h3 className="font-medium">{text("🏦 카드·은행 명세서 대조", "🏦 Check a card or bank statement")}</h3>
        <p className="mt-1 text-xs text-slate-600">{text("CSV 또는 XLSX를 선택해 기록된 거래와 비교하세요. 파일 내용은 이 브라우저에서만 읽고 저장하지 않습니다.", "Choose a CSV or XLSX file to compare with recorded transactions. The file stays in this browser and is not stored.")}</p>
      </div>
      <label className="cursor-pointer rounded-lg border border-blue-300 bg-white px-4 py-2 text-sm font-medium text-blue-900 hover:bg-blue-50">
        {loading ? text("읽는 중…", "Reading…") : text("명세서 선택", "Choose statement")}
        <input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={loading || blocked || activeRow !== null} onChange={(event) => void chooseFile(event)} className="sr-only" />
      </label>
    </div>
    <label className="mt-3 block max-w-xs text-xs text-slate-600">{text("CSV 글자 인코딩 (글자가 깨지면 바꾸고 다시 선택)", "CSV encoding (change and reselect if text is garbled)")}
      <select value={encoding} onChange={(event) => setEncoding(event.target.value as typeof encoding)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm">
        <option value="utf-8">UTF-8</option><option value="euc-kr">EUC-KR / CP949</option><option value="windows-1252">Western / Windows-1252</option>
      </select>
    </label>
    {error && <p role="alert" className="mt-3 text-sm text-amber-800">{t(error)}</p>}
    {table && mapping && <div className="mt-4 space-y-4">
      <p className="text-sm font-medium text-slate-800">{fileName}</p>
      {tables.length > 1 && <label className="block max-w-sm text-xs font-medium">{text("시트", "Sheet")}
        <select value={sheetIndex} disabled={activeRow !== null} onChange={(event) => { const next = Number(event.target.value); setSheetIndex(next); setMapping(suggestMapping(tables[next].rows)); setPage(0); setSavedRows([]); setConfirmedRows([]); }} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm disabled:opacity-50">
          {tables.map((item, index) => <option key={`${index}-${item.name}`} value={index}>{item.name}</option>)}
        </select>
      </label>}
      <fieldset disabled={activeRow !== null} className="grid gap-3 rounded-lg bg-white p-4 ring-1 ring-slate-200 sm:grid-cols-2 lg:grid-cols-4 disabled:opacity-60">
        <label className="text-xs font-medium">{text("대조할 계좌와 통화", "Account and statement currency")}
          <select value={accountId} onChange={(event) => { setAccountId(event.target.value); setPage(0); setConfirmedRows([]); setSavedRows([]); }} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm">
            <option value="">{text("계좌 선택", "Choose account")}</option>
            {accounts.filter((item) => item.is_active).map((item) => <option key={item.id} value={item.id}>{item.name} ({item.currency_code})</option>)}
          </select>
        </label>
        <label className="text-xs font-medium">{text("열 제목 행", "Header row")}
          <select value={mapping.headerRow} onChange={(event) => { setMapping(suggestMapping(table.rows, Number(event.target.value))); setPage(0); setConfirmedRows([]); setSavedRows([]); }} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm">
            {table.rows.slice(0, 12).map((row, index) => <option key={index} value={index}>{index + 1}: {row.slice(0, 3).map((cell) => String(cell ?? "")).join(" · ").slice(0, 80)}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium">{text("날짜 표기 순서", "Date order")}
          <select value={mapping.dateOrder} onChange={(event) => updateMapping({ dateOrder: event.target.value as StatementMapping["dateOrder"] })} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm">
            <option value="DMY">DD/MM/YYYY</option><option value="MDY">MM/DD/YYYY</option>
          </select>
        </label>
        <label className="text-xs font-medium">{text("금액 열 형태", "Amount columns")}
          <select value={mapping.amountMode} onChange={(event) => updateMapping({ amountMode: event.target.value as StatementMapping["amountMode"] })} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm">
            <option value="signed">{text("한 열에 +/- 금액", "One signed amount column")}</option><option value="debit-credit">{text("출금·입금 별도 열", "Separate debit and credit")}</option>
          </select>
        </label>
        {columnField(text("거래일", "Date"), "dateColumn")}
        {columnField(text("내용·가맹점", "Description / merchant"), "descriptionColumn")}
        {mapping.amountMode === "signed" ? <>
          {columnField(text("금액", "Amount"), "amountColumn")}
          <label className="text-xs font-medium">{text("양수(+)의 의미", "Positive amount means")}
            <select value={mapping.positiveMeans} onChange={(event) => updateMapping({ positiveMeans: event.target.value as StatementMapping["positiveMeans"] })} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm">
              <option value="outflow">{text("지출", "Expense")}</option><option value="inflow">{text("수입", "Income")}</option>
            </select>
          </label>
        </> : <>{columnField(text("출금", "Debit"), "debitColumn")}{columnField(text("입금", "Credit"), "creditColumn")}</>}
        {columnField(text("통화 열 (없으면 계좌 통화)", "Currency column (optional)"), "currencyColumn")}
      </fieldset>
      {!mapped ? <p role="status" className="text-sm text-amber-800">{text("계좌, 날짜, 내용, 금액 열을 선택하세요.", "Choose the account, date, description, and amount columns.")}</p> : <>
        <div className="flex flex-wrap gap-3 text-sm text-slate-700">
          <span>{text("기록과 일치", "Likely recorded")}: <strong>{recordedCount}</strong></span>
          <span>{text("직접 확인", "Check manually")}: <strong>{reviewCount}</strong></span>
          <span>{text("앱에 기록 없음", "Not in app")}: <strong>{missingCount}</strong></span>
          <span>{text("읽지 못한 행", "Unreadable rows")}: <strong>{parsed.issues.length}</strong></span>
        </div>
        <p className="text-xs text-slate-600">{text("동일 계좌·통화·금액·수입/지출 방향과 3일 이내 날짜를 대조합니다. 가맹점도 비슷하면 ‘기록과 일치’로 표시합니다. 모든 결과는 제안이며 명세서 기간과 금액 방향을 확인하세요.", "Comparison uses the same account, currency, amount, direction, and a date within three days. Similar merchant text makes a likely recorded match. Check the statement period and amount sign before using any result.")}</p>
        <p className="text-xs text-slate-600">{text("명세서 금액은 선택 계좌의 통화로 입력란에 들어갑니다. 외화 원거래 금액은 직접 고치고, 내 계좌 사이 이동은 ‘내 계좌 간 이체’에서 기록하세요.", "A statement amount fills the form in the selected account's currency. Correct the original amount for foreign purchases. Record moves between your own accounts under Transfers.")}</p>
        <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={showAll} onChange={(event) => { setShowAll(event.target.checked); setPage(0); }} />{text("일치한 거래도 표시", "Show likely recorded rows too")}</label>
        <div className="overflow-x-auto rounded-lg bg-white ring-1 ring-slate-200">
          <table className="w-full min-w-[750px] text-left text-sm"><thead className="border-b border-slate-200 text-xs text-slate-600"><tr>
            <th className="p-3">{text("행", "Row")}</th><th className="p-3">{text("날짜", "Date")}</th><th className="p-3">{text("명세서 내용", "Statement description")}</th><th className="p-3">{text("금액", "Amount")}</th><th className="p-3">{text("대조 결과", "Result")}</th><th className="p-3">{text("동작", "Action")}</th>
          </tr></thead><tbody>{pageRows.map(({ entry, status, reason: matchReason }) => <tr key={entry.sourceRow} className="border-b border-slate-100 align-top">
            <td className="p-3">{entry.sourceRow}</td><td className="p-3">{entry.date}</td><td className="max-w-[300px] break-words p-3">{entry.description}</td>
            <td className="whitespace-nowrap p-3">{entry.direction === "outflow" ? "−" : "+"}{formatMinor(entry.amountMinor, entry.currency)}</td>
            <td className="p-3">{savedRows.includes(entry.sourceRow) ? text("이번 검토에서 저장함", "Saved during this review") : status === "recorded" ? text("기록과 일치 가능", "Likely recorded") : status === "missing" ? text("앱에 기록 없음", "Not in app") : matchReason === "duplicate-row" ? text("명세서에 같은 행이 또 있음", "Duplicate statement rows") : text("기존 기록과 중복 가능", "Could match an existing entry")}</td>
            <td className="p-3">{status !== "recorded" && !savedRows.includes(entry.sourceRow) && <div className="space-y-1">
              {status === "review" && !confirmedRows.includes(entry.sourceRow) && <button type="button" onClick={() => setConfirmedRows((current) => [...current, entry.sourceRow])} className="text-blue-800 underline">{text("중복 여부 확인 후 새 거래로 처리", "Confirm this is a new transaction")}</button>}
              {(status === "missing" || confirmedRows.includes(entry.sourceRow)) && <button type="button" disabled={blocked || activeRow !== null} onClick={() => applyEntry(entry)} className="rounded-lg bg-blue-800 px-3 py-2 text-xs font-medium text-white disabled:opacity-50">{activeRow === entry.sourceRow ? text("입력란에서 확인 후 저장", "Review and save in the form") : text("입력란에 적용", "Use as draft")}</button>}
            </div>}</td>
          </tr>)}</tbody></table>
          {visible.length === 0 && <p className="p-4 text-sm text-slate-600">{text("표시할 거래가 없습니다.", "No rows to show.")}</p>}
        </div>
        {pageCount > 1 && <div className="flex items-center gap-3 text-sm"><button type="button" disabled={page <= 0} onClick={() => setPage((current) => current - 1)} className="underline disabled:opacity-40">{text("이전", "Previous")}</button><span>{Math.min(page, pageCount - 1) + 1} / {pageCount}</span><button type="button" disabled={page >= pageCount - 1} onClick={() => setPage((current) => current + 1)} className="underline disabled:opacity-40">{text("다음", "Next")}</button></div>}
        {parsed.issues.length > 0 && <details className="rounded-lg bg-amber-50 p-3 text-sm"><summary className="cursor-pointer font-medium">{text("읽지 못한 행 확인", "Review unreadable rows")}</summary><ul className="mt-2 list-inside list-disc">{parsed.issues.slice(0, 30).map((issue) => <li key={issue.sourceRow}>{text("행", "Row")} {issue.sourceRow}: {reason(issue.reason)}</li>)}</ul>{parsed.issues.length > 30 && <p className="mt-2">+{parsed.issues.length - 30}</p>}</details>}
        {reconciliation.ledgerOnly.length > 0 && <details className="rounded-lg bg-white p-3 text-sm ring-1 ring-slate-200"><summary className="cursor-pointer font-medium">{text("앱에는 있지만 이 파일에서 찾지 못한 거래", "Recorded in the app, not found in this file")} ({reconciliation.ledgerOnly.length})</summary><p className="mt-2 text-xs text-slate-600">{text("선택한 명세서 날짜 범위 안의 거래입니다. 파일이 해당 기간 전체를 포함하는지 확인하세요.", "These entries fall within the file's date range. Check that this file covers the full period.")}</p><ul className="mt-2 space-y-1">{reconciliation.ledgerOnly.slice(0, 50).map((item) => <li key={item.id}>{item.occurred_on} · {item.description} · {formatMinor(BigInt(item.settlement_amount_minor), item.settlement_currency)}</li>)}</ul>{reconciliation.ledgerOnly.length > 50 && <p className="mt-2">+{reconciliation.ledgerOnly.length - 50}</p>}</details>}
      </>}
    </div>}
  </section>;
}
