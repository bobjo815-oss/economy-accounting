"use client";
import { localDate } from "@/lib/finance/local-date";
import { useLanguage } from "@/lib/i18n/provider";

import { useState } from "react";
import Link from "next/link";

import { formatMinor } from "@/lib/finance/money";
import { serializeCsv } from "@/lib/finance/csv-export";
import { accountBalances, forecast, monthlyActualComposition, monthlyCategoryResults } from "@/lib/finance/reports";
import { planState } from "@/lib/finance/workflow";
import type { WorkspaceData } from "@/lib/finance/records";
import CompositionPie from "./composition-pie";
import SortControl from "./sort-control";
import { compareBigInt, compareText, sortRows } from "@/lib/finance/sorting";

const exportable = ["accounts", "categories", "rates", "plans", "actuals", "splits", "transfers", "merchantRules", "recurringTemplates"] as const;
type Exportable = (typeof exportable)[number];

function downloadCsv(name: Exportable, rows: object[]) {
  if (rows.length === 0) return;
  const content = serializeCsv(rows);
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `study-finance-${name}.csv`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function latestTransactionMonth(data: WorkspaceData) {
  const latest = data.actuals.filter((actual) => !actual.is_reversal).map((actual) => actual.occurred_on).sort().at(-1);
  return latest?.slice(0, 7) ?? localDate(data.profile?.timezone).slice(0, 7);
}

export default function ReportsPanel({ data, view, sortOrder = "category", onSortChange }: {
  data: WorkspaceData; view: "overview" | "reports" | "export"; sortOrder?: string; onSortChange?: (value: string) => void;
}) {
  const { t, locale } = useLanguage();
  const currentBase = data.profile?.base_currency ?? "KRW";
  const [asOf, setAsOf] = useState(() => localDate(data.profile?.timezone));
  const [horizon, setHorizon] = useState<1 | 3 | 6 | 12>(3);
  const [accountId, setAccountId] = useState("");
  const [month, setMonth] = useState(() => latestTransactionMonth(data));
  const [breakdownChoice, setBreakdownChoice] = useState<"category" | "description" | null>(null);
  const [exportName, setExportName] = useState<Exportable>("plans");
  const balances = accountBalances(data);
  const timeline = forecast(data, asOf, horizon, accountId || null);
  const budgetResult = monthlyCategoryResults(data, month);
  const sortedBudgetTotals = sortRows([...budgetResult.totals], ([leftId, left], [rightId, right]) => {
    const categoryName = (id: string) => { const category = data.categories.find((item) => item.id === id); return category ? `${category.major_name} / ${category.name}` : t("Uncategorized"); };
    if (sortOrder === "actual-asc" || sortOrder === "actual-desc") return sortOrder === "actual-desc" ? -compareBigInt(left.actualMinor,right.actualMinor) : compareBigInt(left.actualMinor,right.actualMinor);
    if (sortOrder === "variance-asc" || sortOrder === "variance-desc") { const a = left.actualMinor-left.plannedMinor; const b = right.actualMinor-right.plannedMinor; return sortOrder === "variance-desc" ? -compareBigInt(a,b) : compareBigInt(a,b); }
    return compareText(categoryName(leftId), categoryName(rightId), locale);
  });
  const budget = { ...budgetResult, totals: new Map(sortedBudgetTotals) };
  const monthActualIds = new Set(data.actuals.filter((actual) => actual.occurred_on.startsWith(month) && actual.settlement_status === "settled" && !actual.is_reversal).map((actual) => actual.id));
  const hasClassifiedActuals = data.actuals.some((actual) => monthActualIds.has(actual.id) && actual.category_id) || data.splits.some((split) => monthActualIds.has(split.actual_transaction_id));
  const breakdown = breakdownChoice ?? (hasClassifiedActuals ? "category" : "description");
  const spending = monthlyActualComposition(data, month, "outflow", breakdown);
  const income = monthlyActualComposition(data, month, "inflow", breakdown);
  const relevantAccounts = data.accounts.filter((account) => account.is_active && account.currency_code === currentBase);
  const foreignAccountCount = data.accounts.filter((account) => account.is_active && account.currency_code !== currentBase).length;
  const overdue = data.plans.filter((plan) => ["overdue", "partial · overdue"].includes(planState(plan, data.actuals, asOf))).length;
  const fxReview = data.plans.filter((plan) => plan.currency_code !== plan.base_currency &&
    plan.baseline_fx_snapshot_id !== plan.forecast_fx_snapshot_id).length;

  const selectedRows = data[exportName] as object[];
  const compositionSlices = (items: typeof spending.rows, direction: "outflow" | "inflow") => items.map((item) => {
    const category = data.categories.find((candidate) => candidate.id === item.categoryId);
    const fallback = item.entryKind === "loan_drawdown" ? t("Loan drawdown") : t("Uncategorized");
    const label = item.label ?? (category ? `${category.major_name} / ${category.name}` : fallback);
    return { key: item.key, label: direction === "inflow" && item.entryKind === "loan_drawdown" ? `${label} · ${t("Loan drawdown")}` : label, amountMinor: item.amountMinor };
  });

  return <section id="overview" className="space-y-6">
    {view === "overview" && <>
    <div className="flex items-center gap-3 text-sm text-slate-600"><span>{t("Reporting currency")}: {currentBase}</span></div>

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[[t("Opening selected cash"), formatMinor(timeline.openingMinor, currentBase)], [t("Closing forecast"), formatMinor(timeline.closingMinor, currentBase)], [t("Lowest forecast"), formatMinor(timeline.lowestMinor, currentBase)], [t("Overdue plans"), String(overdue)]].map(([label, value]) => <div key={t(label)} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200"><p className="text-sm text-slate-500">{t(label)}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div>)}
    </div>
    <p className="text-sm text-slate-600">{foreignAccountCount}{" "}{t("account(s) in other currencies are shown separately below.")}{" "}{fxReview}{" "}{t("plan(s) have revised FX assumptions.")}{" "}{timeline.lowestMinor < BigInt(data.profile?.safety_balance_minor ?? 0) ? t("Forecast falls below your safety balance.") : t("Forecast stays above your safety balance.")}</p>

    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200"><h2 className="font-semibold">{t("Account balances")}</h2><ul className="mt-3 divide-y divide-slate-100">{data.accounts.map((account) => <li key={account.id} className="flex justify-between gap-4 py-2 text-sm"><span>{account.name}</span><span>{formatMinor(balances.get(account.id) ?? BigInt(0), account.currency_code)}</span></li>)}</ul>{data.accounts.length === 0 && <p className="mt-4 text-sm text-slate-500">{t("No accounts yet.")}</p>}</section>
      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">{t("Cash forecast")}</h2><select aria-label={t("Forecast horizon")} value={horizon} onChange={(event) => setHorizon(Number(event.target.value) as 1 | 3 | 6 | 12)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value={1}>{t("1 month")}</option><option value={3}>{t("3 months")}</option><option value={6}>{t("6 months")}</option><option value={12}>{t("1 year")}</option></select></div><div className="mt-3 flex gap-3"><label className="text-sm">{t("As of")}<input type="date" value={asOf} onChange={(event) => setAsOf(event.target.value)} className="mt-1 block rounded-lg border border-slate-300 px-3 py-2" /></label><label className="text-sm">{t("Account scope")}<select value={accountId} onChange={(event) => setAccountId(event.target.value)} className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="">{t("All")}{" "}{currentBase}{" "}{t("accounts")}</option>{relevantAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label></div><ol className="mt-4 max-h-64 overflow-auto divide-y divide-slate-100">{timeline.events.map((event, index) => <li key={`${event.date}-${index}`} className="flex justify-between gap-3 py-2 text-sm"><span>{event.date} · {event.title}</span><span>{formatMinor(event.closingMinor, currentBase)}</span></li>)}</ol>{timeline.events.length === 0 && <p className="mt-4 text-sm text-slate-500">{t("No outstanding plans in this horizon.")}</p>}</section>
    </div>

    </>}
    {view === "reports" && <div className="space-y-6">
      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">{t("Spending and income analysis")}</h2><p className="mt-1 text-sm text-slate-500">{t("Monthly distribution by your chosen categories, using settled account amounts.")}</p></div><div className="flex flex-wrap items-end gap-3"><label className="text-sm">{t("Month")}<input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="ml-2 rounded-lg border border-slate-300 px-3 py-2" /></label><label className="text-sm">{t("Break down by")}<select value={breakdown} onChange={(event) => setBreakdownChoice(event.target.value as "category" | "description")} className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="category">{t("Category")}</option><option value="description">{t("Merchant / description")}</option></select></label></div></div>
        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          <CompositionPie title={breakdown === "category" ? t("Income by source") : t("Income by description")} rows={compositionSlices(income.rows,"inflow")} currency={currentBase} emptyLabel={t("No settled income in this month and reporting currency.")} />
          <CompositionPie title={breakdown === "category" ? t("Spending by category") : t("Spending by merchant")} rows={compositionSlices(spending.rows,"outflow")} currency={currentBase} emptyLabel={t("No settled spending in this month and reporting currency.")} />
        </div>
        {(spending.unconvertedActuals > 0 || income.unconvertedActuals > 0) && <p className="mt-4 text-sm text-amber-800">{spending.unconvertedActuals + income.unconvertedActuals} {t("settlement(s) in other account currencies are excluded until they can be converted to the reporting currency.")}</p>}
        {(spending.rows.some((row) => !row.categoryId) || income.rows.some((row) => !row.categoryId)) && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{t("Some records are still uncategorized, so the chart cannot yet show their spending area or income source.")} <Link href="/workspace/categories" className="font-medium underline">{t("Create categories")}</Link>{" · "}<Link href="/workspace/actuals" className="font-medium underline">{t("Assign them in Transactions")}</Link></p>}
        <div className="mt-4 flex justify-end"><SortControl label={locale === "ko" ? "예산표 정렬" : "Sort budget table"} value={sortOrder} onChange={onSortChange ?? (() => {})} options={[
          { value: "category", label: locale === "ko" ? "분류 · ㄱ-ㅎ / A-Z" : "Category · A-Z" },
          { value: "actual-asc", label: locale === "ko" ? "실제 금액 · 낮은 순" : "Actual · low to high" },
          { value: "actual-desc", label: locale === "ko" ? "실제 금액 · 높은 순" : "Actual · high to low" },
          { value: "variance-asc", label: locale === "ko" ? "차이 · 낮은 순" : "Variance · low to high" },
          { value: "variance-desc", label: locale === "ko" ? "차이 · 높은 순" : "Variance · high to low" },
        ]} /></div>
      </section>
      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200"><h2 className="font-semibold">{t("Budget vs Actual")}</h2><p className="mt-1 text-sm text-slate-500">{t("Outflows in")} {currentBase}. {budget.unconvertedActuals} {t("settlement(s) in other account currencies need a reporting conversion.")}</p><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[580px] text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase text-slate-500"><tr><th className="pb-2">{t("Category")}</th><th className="pb-2 text-right">{t("Forecast")}</th><th className="pb-2 text-right">{t("Actual")}</th><th className="pb-2 text-right">{t("Variance")}</th><th className="pb-2 text-right">{t("Execution")}</th></tr></thead><tbody>{[...budget.totals].map(([id, total]) => { const category = data.categories.find((item) => item.id === id); const execution = total.plannedMinor === BigInt(0) ? "—" : `${Number(total.actualMinor * BigInt(10000) / total.plannedMinor) / 100}%`; return <tr key={id} className="border-b border-slate-100"><td className="py-2">{category ? `${category.major_name} / ${category.name}` : t("Uncategorized")}</td><td className="py-2 text-right">{formatMinor(total.plannedMinor, currentBase)}</td><td className="py-2 text-right">{formatMinor(total.actualMinor, currentBase)}</td><td className="py-2 text-right">{formatMinor(total.actualMinor - total.plannedMinor, currentBase)}</td><td className="py-2 text-right">{execution}</td></tr>; })}</tbody></table>{budget.totals.size === 0 && <p className="py-5 text-sm text-slate-500">{t("No forecast or actual outflows this month.")}</p>}</div></section>
    </div>}

    {view === "export" && <section className="flex flex-wrap items-end gap-3 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200"><div><h2 className="font-semibold">{t("CSV export")}</h2><p className="text-sm text-slate-500">{t("Choose one record type to download. Keep exported files private.")}</p></div><label className="text-sm">{t("Records")}<select value={exportName} onChange={(event) => setExportName(event.target.value as Exportable)} className="ml-2 rounded-lg border border-slate-300 bg-white px-3 py-2">{exportable.map((name) => <option key={name} value={name}>{t(name)}</option>)}</select></label><button type="button" disabled={selectedRows.length === 0} onClick={() => downloadCsv(exportName, selectedRows)} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{t("Download CSV")}</button></section>}
  </section>;
}
