"use client";

import { useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatMinor, parseAmountToMinor, parseRate, safeMinorNumber, supportedCurrencies, type CurrencyCode } from "@/lib/finance/money";
import { planCosts } from "@/lib/finance/plan-calculation";
import type { CashDirection, EntryKind, PlanRow, WorkspaceData } from "@/lib/finance/records";

const kinds: { value: EntryKind; label: string; direction: CashDirection }[] = [
  { value: "expense", label: "Expense", direction: "outflow" },
  { value: "income", label: "Income", direction: "inflow" },
  { value: "loan_drawdown", label: "Loan drawdown", direction: "inflow" },
  { value: "loan_principal", label: "Loan principal", direction: "outflow" },
  { value: "loan_interest", label: "Loan interest", direction: "outflow" },
];

function effectiveStatus(plan: PlanRow, data: WorkspaceData) {
  if (plan.status === "canceled") return "Canceled";
  const reversed = new Set(data.actuals.filter((actual) => actual.correction_of_id).map((actual) => actual.correction_of_id));
  const paid = data.actuals.filter((actual) => actual.plan_id === plan.id && !actual.is_reversal && !reversed.has(actual.id))
    .reduce((sum, actual) => sum + BigInt(actual.original_amount_minor), BigInt(0));
  if (paid >= BigInt(plan.original_amount_minor)) return "Completed";
  if (paid > BigInt(0)) return plan.scheduled_date < new Date().toISOString().slice(0, 10) ? "Partial · overdue" : "Partial";
  return plan.scheduled_date < new Date().toISOString().slice(0, 10) ? "Overdue" : "Pending";
}

export default function PlansPanel({ data, userId, supabase, refresh }: {
  data: WorkspaceData; userId: string; supabase: SupabaseClient; refresh: () => Promise<void>;
}) {
  const baseCurrency = data.profile?.base_currency ?? "KRW";
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [kind, setKind] = useState<EntryKind>("expense");
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode>("GBP");
  const [baselineRate, setBaselineRate] = useState("");
  const [forecastRate, setForecastRate] = useState("");
  const [baselineFee, setBaselineFee] = useState("");
  const [forecastFee, setForecastFee] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newRate, setNewRate] = useState("");
  const [newFee, setNewFee] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function insertRate(from: CurrencyCode, to: CurrencyCode, rate: string, purpose: "baseline_plan" | "forecast", observedOn: string) {
    const result = await supabase.from("fx_snapshots").insert({
      user_id: userId, from_currency: from, to_currency: to, rate,
      observed_on: observedOn, purpose, source_label: "Manual entry",
    }).select("id").single();
    if (result.error || !result.data) throw new Error("FX snapshot could not be saved.");
    return result.data.id as string;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const original = parseAmountToMinor(amount, currency);
    const baselineFeeMinor = parseAmountToMinor(baselineFee || "0", baseCurrency);
    const forecastFeeMinor = parseAmountToMinor(forecastFee || "0", baseCurrency);
    if (!title.trim() || !date || !original || original <= BigInt(0) ||
      baselineFeeMinor === null || forecastFeeMinor === null ||
      safeMinorNumber(original) === null || safeMinorNumber(baselineFeeMinor) === null || safeMinorNumber(forecastFeeMinor) === null ||
      (currency !== baseCurrency && (!parseRate(baselineRate) || !parseRate(forecastRate)))) {
      setMessage("Check the title, date, amounts, and both FX rates for a foreign-currency plan."); return;
    }
    const selectedKind = kinds.find((item) => item.value === kind);
    if (!selectedKind) return;
    setPending(true);
    try {
      const baselineId = currency === baseCurrency ? null : await insertRate(currency, baseCurrency, baselineRate, "baseline_plan", date);
      const forecastId = currency === baseCurrency ? null : await insertRate(currency, baseCurrency, forecastRate, "forecast", date);
      const { error } = await supabase.from("plans").insert({
        user_id: userId, title: title.trim(), scheduled_date: date, direction: selectedKind.direction, entry_kind: kind,
        category_id: categoryId || null, account_id: accountId || null,
        original_amount_minor: Number(original), currency_code: currency, base_currency: baseCurrency,
        baseline_fx_snapshot_id: baselineId, forecast_fx_snapshot_id: forecastId,
        baseline_fee_minor: Number(baselineFeeMinor), forecast_fee_minor: Number(forecastFeeMinor), status: "pending",
      });
      if (error) throw new Error("Plan could not be saved.");
      setTitle(""); setAmount(""); setBaselineRate(""); setForecastRate(""); setBaselineFee(""); setForecastFee("");
      setMessage("Plan saved with separate baseline and forecast amounts.");
      await refresh();
    } catch {
      setMessage("Plan could not be saved. Check the database setup and selected account or category.");
    } finally { setPending(false); }
  }

  async function reviseForecast(plan: PlanRow) {
    const fee = parseAmountToMinor(newFee || "0", plan.base_currency);
    if (fee === null || safeMinorNumber(fee) === null ||
      (plan.currency_code !== plan.base_currency && !parseRate(newRate))) {
      setMessage("Enter a valid new forecast rate and fee."); return;
    }
    setPending(true);
    try {
      const snapshotId = plan.currency_code === plan.base_currency ? null :
        await insertRate(plan.currency_code, plan.base_currency, newRate, "forecast", new Date().toISOString().slice(0, 10));
      const { error } = await supabase.from("plans").update({
        forecast_fx_snapshot_id: snapshotId, forecast_fee_minor: Number(fee),
      }).eq("id", plan.id).eq("user_id", userId);
      if (error) throw new Error("Forecast could not be updated.");
      setEditingId(null); setNewRate(""); setNewFee(""); setMessage("Forecast revised; baseline retained.");
      await refresh();
    } catch { setMessage("Forecast could not be updated."); }
    finally { setPending(false); }
  }

  return <section id="plans" className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
    <h2 className="text-lg font-semibold">Plans</h2>
    <p className="mt-1 text-sm text-slate-500">Reporting currency: {baseCurrency}. Each rate is a manual snapshot.</p>
    <form onSubmit={submit} className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="text-sm lg:col-span-2">Title<input required maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
      <label className="text-sm">Due date<input required type="date" value={date} onChange={(event) => setDate(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
      <label className="text-sm">Type<select value={kind} onChange={(event) => setKind(event.target.value as EntryKind)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2">{kinds.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      <label className="text-sm">Original amount<input required inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
      <label className="text-sm">Currency<select value={currency} onChange={(event) => setCurrency(event.target.value as CurrencyCode)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2">{supportedCurrencies.map((code) => <option key={code}>{code}</option>)}</select></label>
      <label className="text-sm">Category<select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="">Uncategorized</option>{data.categories.filter((category) => category.is_active && category.normal_direction === kinds.find((item) => item.value === kind)?.direction).map((category) => <option key={category.id} value={category.id}>{category.major_name} / {category.name}</option>)}</select></label>
      <label className="text-sm">Expected account<select value={accountId} onChange={(event) => setAccountId(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="">Unassigned</option>{data.accounts.filter((account) => account.is_active).map((account) => <option key={account.id} value={account.id}>{account.name} ({account.currency_code})</option>)}</select></label>
      {currency !== baseCurrency && <><label className="text-sm">Baseline FX: 1 {currency} in {baseCurrency}<input required inputMode="decimal" value={baselineRate} onChange={(event) => setBaselineRate(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label><label className="text-sm">Current forecast FX<input required inputMode="decimal" value={forecastRate} onChange={(event) => setForecastRate(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label></>}
      <label className="text-sm">Baseline separate fee ({baseCurrency})<input inputMode="decimal" value={baselineFee} onChange={(event) => setBaselineFee(event.target.value)} placeholder="0" className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
      <label className="text-sm">Forecast separate fee ({baseCurrency})<input inputMode="decimal" value={forecastFee} onChange={(event) => setForecastFee(event.target.value)} placeholder="0" className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
      <div className="flex items-end"><button disabled={pending} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Save plan</button></div>
    </form>
    {message && <p role="status" className="mt-3 text-sm text-slate-600">{message}</p>}
    <div className="mt-6 overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase text-slate-500"><tr><th className="pb-2">Due</th><th className="pb-2">Plan</th><th className="pb-2">Status</th><th className="pb-2 text-right">Original</th><th className="pb-2 text-right">Baseline</th><th className="pb-2 text-right">Current</th><th className="pb-2 text-right">Review</th></tr></thead><tbody>{data.plans.map((plan) => { const costs = planCosts(plan, data.rates); return <tr key={plan.id} className="border-b border-slate-100 align-top"><td className="py-3">{plan.scheduled_date}</td><td className="py-3">{plan.title}</td><td className="py-3">{effectiveStatus(plan, data)}</td><td className="py-3 text-right">{formatMinor(BigInt(plan.original_amount_minor), plan.currency_code)}</td><td className="py-3 text-right">{costs.baseline === null ? "Rate missing" : formatMinor(costs.baseline, plan.base_currency)}</td><td className="py-3 text-right">{costs.forecast === null ? "Rate missing" : formatMinor(costs.forecast, plan.base_currency)}</td><td className="py-3 text-right">{editingId === plan.id ? <div className="space-y-2"><input aria-label="New forecast rate" value={newRate} onChange={(event) => setNewRate(event.target.value)} placeholder={plan.currency_code === plan.base_currency ? "Rate not needed" : "New rate"} className="w-28 rounded border px-2 py-1" /><input aria-label="New forecast fee" value={newFee} onChange={(event) => setNewFee(event.target.value)} placeholder="Fee" className="w-24 rounded border px-2 py-1" /><button type="button" disabled={pending} onClick={() => reviseForecast(plan)} className="block text-slate-900 underline">Save forecast</button></div> : <button type="button" onClick={() => { setEditingId(plan.id); setNewRate(""); setNewFee(String(plan.forecast_fee_minor / (plan.base_currency === "KRW" ? 1 : 100))); }} className="underline">Revise FX / fee</button>}</td></tr>; })}</tbody></table>{data.plans.length === 0 && <p className="py-5 text-sm text-slate-500">No plans yet.</p>}</div>
  </section>;
}
