"use client";

import { useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatMinor, parseAmountToMinor, safeMinorNumber, supportedCurrencies, type CurrencyCode } from "@/lib/finance/money";
import { accountBalances, forecast, monthlyCategoryResults } from "@/lib/finance/reports";
import type { WorkspaceData } from "@/lib/finance/records";

const exportable = ["accounts", "categories", "rates", "plans", "actuals", "splits", "transfers", "merchantRules", "recurringTemplates"] as const;
type Exportable = (typeof exportable)[number];

function csvCell(value: unknown) {
  const raw = value === null || value === undefined ? "" : String(value);
  const safe = /^[=+@]/.test(raw) || (/^-/.test(raw) && !/^-\d+(?:\.\d+)?$/.test(raw)) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}

function downloadCsv(name: Exportable, rows: object[]) {
  if (rows.length === 0) return;
  const columns = Object.keys(rows[0]);
  const content = [columns.map(csvCell).join(","), ...rows.map((row) => columns.map((key) => csvCell((row as Record<string, unknown>)[key])).join(","))].join("\r\n");
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `study-finance-${name}.csv`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ReportsPanel({ data, userId, supabase, refresh }: {
  data: WorkspaceData; userId: string; supabase: SupabaseClient; refresh: () => Promise<void>;
}) {
  const currentBase = data.profile?.base_currency ?? "KRW";
  const [baseCurrency, setBaseCurrency] = useState<CurrencyCode>(currentBase);
  const [safetyBalance, setSafetyBalance] = useState(data.profile ? formatMinor(BigInt(data.profile.safety_balance_minor), currentBase).split(" ")[0].replaceAll(",", "") : "0");
  const [asOf, setAsOf] = useState(() => new Date().toISOString().slice(0, 10));
  const [horizon, setHorizon] = useState<3 | 6>(3);
  const [accountId, setAccountId] = useState("");
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [exportName, setExportName] = useState<Exportable>("plans");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const balances = accountBalances(data);
  const timeline = forecast(data, asOf, horizon, accountId || null);
  const budget = monthlyCategoryResults(data, month);
  const relevantAccounts = data.accounts.filter((account) => account.is_active && account.currency_code === currentBase);
  const foreignAccountCount = data.accounts.filter((account) => account.is_active && account.currency_code !== currentBase).length;
  const overdue = data.plans.filter((plan) => plan.status !== "canceled" && plan.scheduled_date < asOf &&
    !data.actuals.some((actual) => actual.plan_id === plan.id && !actual.is_reversal && actual.original_amount_minor >= plan.original_amount_minor)).length;
  const fxReview = data.plans.filter((plan) => plan.currency_code !== plan.base_currency &&
    plan.baseline_fx_snapshot_id !== plan.forecast_fx_snapshot_id).length;

  async function savePreferences(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const safety = parseAmountToMinor(safetyBalance, baseCurrency);
    if (safety === null || safeMinorNumber(safety) === null) { setMessage("Enter a valid safety balance."); return; }
    setPending(true);
    const { error } = await supabase.from("profiles").upsert({
      id: userId, base_currency: baseCurrency, safety_balance_minor: Number(safety), timezone: "Europe/London",
    });
    setPending(false);
    setMessage(error ? "Preferences could not be saved." : "Preferences saved. Existing plan rate snapshots keep their original base currency.");
    if (!error) { setAccountId(""); await refresh(); }
  }

  const selectedRows = data[exportName] as object[];

  return <section id="overview" className="space-y-6">
    <form onSubmit={savePreferences} className="flex flex-wrap items-end gap-3 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <label className="text-sm">Reporting currency<select value={baseCurrency} onChange={(event) => setBaseCurrency(event.target.value as CurrencyCode)} className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2">{supportedCurrencies.map((code) => <option key={code}>{code}</option>)}</select></label>
      <label className="text-sm">Safety balance ({baseCurrency})<input inputMode="decimal" value={safetyBalance} onChange={(event) => setSafetyBalance(event.target.value)} className="mt-1 block w-36 rounded-lg border border-slate-300 px-3 py-2" /></label>
      <button disabled={pending} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Save preferences</button>
      {message && <p role="status" className="w-full text-sm text-slate-600">{message}</p>}
    </form>

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[["Opening selected cash", formatMinor(timeline.openingMinor, currentBase)], ["Closing forecast", formatMinor(timeline.closingMinor, currentBase)], ["Lowest forecast", formatMinor(timeline.lowestMinor, currentBase)], ["Overdue plans", String(overdue)]].map(([label, value]) => <div key={label} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div>)}
    </div>
    <p className="text-sm text-slate-600">{foreignAccountCount} account(s) in other currencies are shown separately below. {fxReview} plan(s) have revised FX assumptions. {timeline.lowestMinor < BigInt(data.profile?.safety_balance_minor ?? 0) ? "Forecast falls below your safety balance." : "Forecast stays above your safety balance."}</p>

    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200"><h2 className="font-semibold">Account balances</h2><ul className="mt-3 divide-y divide-slate-100">{data.accounts.map((account) => <li key={account.id} className="flex justify-between gap-4 py-2 text-sm"><span>{account.name}</span><span>{formatMinor(balances.get(account.id) ?? BigInt(0), account.currency_code)}</span></li>)}</ul>{data.accounts.length === 0 && <p className="mt-4 text-sm text-slate-500">No accounts yet.</p>}</section>
      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">Cash forecast</h2><select aria-label="Forecast horizon" value={horizon} onChange={(event) => setHorizon(Number(event.target.value) as 3 | 6)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value={3}>3 months</option><option value={6}>6 months</option></select></div><div className="mt-3 flex gap-3"><label className="text-sm">As of<input type="date" value={asOf} onChange={(event) => setAsOf(event.target.value)} className="mt-1 block rounded-lg border border-slate-300 px-3 py-2" /></label><label className="text-sm">Account scope<select value={accountId} onChange={(event) => setAccountId(event.target.value)} className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="">All {currentBase} accounts</option>{relevantAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label></div><ol className="mt-4 max-h-64 overflow-auto divide-y divide-slate-100">{timeline.events.map((event, index) => <li key={`${event.date}-${index}`} className="flex justify-between gap-3 py-2 text-sm"><span>{event.date} · {event.title}</span><span>{formatMinor(event.closingMinor, currentBase)}</span></li>)}</ol>{timeline.events.length === 0 && <p className="mt-4 text-sm text-slate-500">No outstanding plans in this horizon.</p>}</section>
    </div>

    <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">Budget vs Actual</h2><label className="text-sm">Month<input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="ml-2 rounded-lg border border-slate-300 px-3 py-2" /></label></div><p className="mt-1 text-sm text-slate-500">Outflows in {currentBase}. {budget.unconvertedActuals} settlement(s) in other account currencies need a reporting conversion.</p><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[580px] text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase text-slate-500"><tr><th className="pb-2">Category</th><th className="pb-2 text-right">Forecast</th><th className="pb-2 text-right">Actual</th><th className="pb-2 text-right">Variance</th><th className="pb-2 text-right">Execution</th></tr></thead><tbody>{[...budget.totals].map(([id, total]) => { const category = data.categories.find((item) => item.id === id); const execution = total.plannedMinor === BigInt(0) ? "—" : `${Number(total.actualMinor * BigInt(10000) / total.plannedMinor) / 100}%`; return <tr key={id} className="border-b border-slate-100"><td className="py-2">{category ? `${category.major_name} / ${category.name}` : "Uncategorized"}</td><td className="py-2 text-right">{formatMinor(total.plannedMinor, currentBase)}</td><td className="py-2 text-right">{formatMinor(total.actualMinor, currentBase)}</td><td className="py-2 text-right">{formatMinor(total.actualMinor - total.plannedMinor, currentBase)}</td><td className="py-2 text-right">{execution}</td></tr>; })}</tbody></table>{budget.totals.size === 0 && <p className="py-5 text-sm text-slate-500">No forecast or actual outflows this month.</p>}</div></section>

    <section className="flex flex-wrap items-end gap-3 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200"><div><h2 className="font-semibold">CSV export</h2><p className="text-sm text-slate-500">Choose one record type to download. Keep exported files private.</p></div><label className="text-sm">Records<select value={exportName} onChange={(event) => setExportName(event.target.value as Exportable)} className="ml-2 rounded-lg border border-slate-300 bg-white px-3 py-2">{exportable.map((name) => <option key={name} value={name}>{name}</option>)}</select></label><button type="button" disabled={selectedRows.length === 0} onClick={() => downloadCsv(exportName, selectedRows)} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Download CSV</button></section>
  </section>;
}
