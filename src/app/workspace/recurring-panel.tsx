"use client";

import { useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatMinor, parseAmountToMinor, parseRate, safeMinorNumber, supportedCurrencies, type CurrencyCode } from "@/lib/finance/money";
import { nextUnproposedDate } from "@/lib/finance/recurrence";
import type { EntryKind, WorkspaceData } from "@/lib/finance/records";

const kinds: { value: EntryKind; label: string; direction: "inflow" | "outflow" }[] = [
  { value: "expense", label: "Expense", direction: "outflow" },
  { value: "income", label: "Income", direction: "inflow" },
  { value: "loan_drawdown", label: "Loan drawdown", direction: "inflow" },
  { value: "loan_principal", label: "Loan principal", direction: "outflow" },
  { value: "loan_interest", label: "Loan interest", direction: "outflow" },
];

export default function RecurringPanel({ data, userId, supabase, refresh }: {
  data: WorkspaceData; userId: string; supabase: SupabaseClient; refresh: () => Promise<void>;
}) {
  const baseCurrency = data.profile?.base_currency ?? "KRW";
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [cadence, setCadence] = useState<"weekly" | "monthly" | "yearly">("monthly");
  const [kind, setKind] = useState<EntryKind>("expense");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode>("GBP");
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [baselineRate, setBaselineRate] = useState("");
  const [forecastRate, setForecastRate] = useState("");
  const [baselineFee, setBaselineFee] = useState("");
  const [forecastFee, setForecastFee] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const selected = data.recurringTemplates.find((item) => item.id === selectedId);
  const proposedDate = selected ? nextUnproposedDate(selected, data.plans.filter((plan) => plan.recurring_template_id === selected.id).map((plan) => plan.scheduled_date)) : null;

  async function createTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const minor = parseAmountToMinor(amount, currency);
    if (!title.trim() || !date || !minor || minor <= BigInt(0) || safeMinorNumber(minor) === null) {
      setMessage("Enter a title, first date, and valid amount."); return;
    }
    const direction = kinds.find((item) => item.value === kind)?.direction;
    if (!direction) return;
    setPending(true);
    const { error } = await supabase.from("recurring_templates").insert({
      user_id: userId, title: title.trim(), next_date: date, cadence,
      anchor_month: Number(date.slice(5, 7)), anchor_day: Number(date.slice(8, 10)),
      direction, entry_kind: kind, category_id: categoryId || null, account_id: accountId || null,
      original_amount_minor: Number(minor), currency_code: currency, is_active: true,
    });
    setPending(false);
    if (error) { setMessage("Recurring template could not be saved."); return; }
    setTitle(""); setAmount(""); setMessage("Template saved. It creates only proposed plans when you confirm them.");
    await refresh();
  }

  async function confirmProposal() {
    if (!selected || !proposedDate) return;
    const baselineFeeMinor = parseAmountToMinor(baselineFee || "0", baseCurrency);
    const forecastFeeMinor = parseAmountToMinor(forecastFee || "0", baseCurrency);
    if (baselineFeeMinor === null || forecastFeeMinor === null ||
      safeMinorNumber(baselineFeeMinor) === null || safeMinorNumber(forecastFeeMinor) === null ||
      (selected.currency_code !== baseCurrency && (!parseRate(baselineRate) || !parseRate(forecastRate)))) {
      setMessage("Confirm both FX rates and fees for this occurrence."); return;
    }
    setPending(true);
    try {
      let baselineId: string | null = null;
      let forecastId: string | null = null;
      if (selected.currency_code !== baseCurrency) {
        const baseline = await supabase.from("fx_snapshots").insert({
          user_id: userId, from_currency: selected.currency_code, to_currency: baseCurrency,
          rate: baselineRate, observed_on: proposedDate, purpose: "baseline_plan", source_label: "Manual recurrence proposal",
        }).select("id").single();
        if (baseline.error || !baseline.data) throw new Error("Baseline rate could not be saved.");
        baselineId = baseline.data.id as string;
        const latest = await supabase.from("fx_snapshots").insert({
          user_id: userId, from_currency: selected.currency_code, to_currency: baseCurrency,
          rate: forecastRate, observed_on: proposedDate, purpose: "forecast", source_label: "Manual recurrence proposal",
        }).select("id").single();
        if (latest.error || !latest.data) throw new Error("Forecast rate could not be saved.");
        forecastId = latest.data.id as string;
      }
      const { error } = await supabase.from("plans").insert({
        user_id: userId, title: selected.title, scheduled_date: proposedDate, direction: selected.direction,
        entry_kind: selected.entry_kind, category_id: selected.category_id, account_id: selected.account_id,
        original_amount_minor: selected.original_amount_minor, currency_code: selected.currency_code, base_currency: baseCurrency,
        baseline_fx_snapshot_id: baselineId, forecast_fx_snapshot_id: forecastId,
        baseline_fee_minor: Number(baselineFeeMinor), forecast_fee_minor: Number(forecastFeeMinor),
        status: "pending", recurring_template_id: selected.id,
      });
      if (error) throw new Error("Proposed plan could not be saved.");
      setBaselineRate(""); setForecastRate(""); setBaselineFee(""); setForecastFee("");
      setMessage(`Proposed plan saved for ${proposedDate}. No actual settlement was created.`);
      await refresh();
    } catch { setMessage("Proposed plan could not be saved. Check for an existing occurrence."); }
    finally { setPending(false); }
  }

  return <section id="recurring" className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
    <h2 className="text-lg font-semibold">Recurring plans</h2><p className="mt-1 text-sm text-slate-500">Templates suggest future plans. Every occurrence needs your confirmation.</p>
    <form onSubmit={createTemplate} className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="text-sm lg:col-span-2">Title<input required value={title} onChange={(event) => setTitle(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
      <label className="text-sm">First date<input required type="date" value={date} onChange={(event) => setDate(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
      <label className="text-sm">Cadence<select value={cadence} onChange={(event) => setCadence(event.target.value as typeof cadence)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></label>
      <label className="text-sm">Type<select value={kind} onChange={(event) => setKind(event.target.value as EntryKind)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2">{kinds.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      <label className="text-sm">Amount<input required inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
      <label className="text-sm">Currency<select value={currency} onChange={(event) => setCurrency(event.target.value as CurrencyCode)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2">{supportedCurrencies.map((code) => <option key={code}>{code}</option>)}</select></label>
      <label className="text-sm">Category<select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="">Uncategorized</option>{data.categories.filter((category) => category.is_active).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
      <label className="text-sm">Account<select value={accountId} onChange={(event) => setAccountId(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="">Unassigned</option>{data.accounts.filter((account) => account.is_active).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
      <div className="flex items-end"><button disabled={pending} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Save template</button></div>
    </form>
    <div className="mt-6 grid gap-4 lg:grid-cols-2"><div><h3 className="text-sm font-semibold">Templates</h3><ul className="mt-2 divide-y divide-slate-100">{data.recurringTemplates.filter((item) => item.is_active).map((item) => <li key={item.id} className="flex items-center justify-between gap-4 py-3 text-sm"><span>{item.title} · {item.cadence}<br /><span className="text-slate-500">{formatMinor(BigInt(item.original_amount_minor), item.currency_code)}</span></span><button type="button" onClick={() => setSelectedId(item.id)} className="underline">Propose</button></li>)}</ul></div>{selected && proposedDate && <div className="rounded-xl bg-slate-50 p-4"><h3 className="font-semibold">Review proposed plan</h3><p className="mt-1 text-sm">{selected.title} · {proposedDate} · {formatMinor(BigInt(selected.original_amount_minor), selected.currency_code)}</p>{selected.currency_code !== baseCurrency && <div className="mt-3 grid grid-cols-2 gap-2"><label className="text-sm">Baseline FX<input required inputMode="decimal" value={baselineRate} onChange={(event) => setBaselineRate(event.target.value)} className="mt-1 block w-full rounded border px-2 py-1" /></label><label className="text-sm">Current FX<input required inputMode="decimal" value={forecastRate} onChange={(event) => setForecastRate(event.target.value)} className="mt-1 block w-full rounded border px-2 py-1" /></label></div>}<div className="mt-3 grid grid-cols-2 gap-2"><label className="text-sm">Baseline fee ({baseCurrency})<input inputMode="decimal" value={baselineFee} onChange={(event) => setBaselineFee(event.target.value)} placeholder="0" className="mt-1 block w-full rounded border px-2 py-1" /></label><label className="text-sm">Forecast fee ({baseCurrency})<input inputMode="decimal" value={forecastFee} onChange={(event) => setForecastFee(event.target.value)} placeholder="0" className="mt-1 block w-full rounded border px-2 py-1" /></label></div><button type="button" disabled={pending} onClick={confirmProposal} className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50">Confirm proposed plan</button></div>}</div>
    {message && <p role="status" className="mt-3 text-sm text-slate-600">{message}</p>}
  </section>;
}
