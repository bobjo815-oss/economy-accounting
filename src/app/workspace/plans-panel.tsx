"use client";
import { localDate } from "@/lib/finance/local-date";
import { useLanguage } from "@/lib/i18n/provider";

import { Fragment, useEffect, useState, type FormEvent } from "react";
import PlanDetailsEditor from "./plan-details-editor";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatMinor, parseAmountToMinor, parseRate, safeMinorNumber, supportedCurrencies, type CurrencyCode } from "@/lib/finance/money";
import { planCosts } from "@/lib/finance/plan-calculation";
import { planState } from "@/lib/finance/workflow";
import { fetchReferenceRate } from "@/lib/finance/exchange-rates";
import type { CashDirection, EntryKind, PlanRow, WorkspaceData } from "@/lib/finance/records";
import SortControl from "./sort-control";

const kinds: { value: EntryKind; label: string; direction: CashDirection }[] = [
  { value: "income", label: "Income", direction: "inflow" },
  { value: "expense", label: "Expense", direction: "outflow" },
  { value: "loan_drawdown", label: "Loan drawdown", direction: "inflow" },
  { value: "loan_principal", label: "Loan principal", direction: "outflow" },
  { value: "loan_interest", label: "Loan interest", direction: "outflow" },
];

function effectiveStatus(plan: PlanRow, data: WorkspaceData) {
  return planState(plan, data.actuals, localDate(data.profile?.timezone));
}

export default function PlansPanel({ data, userId, supabase, refresh, sortOrder, onSortChange }: {
  data: WorkspaceData; userId: string; supabase: SupabaseClient; refresh: () => Promise<void>; sortOrder: string; onSortChange: (value: string) => void;
}) {
  const { t, locale } = useLanguage();
  const text = (ko: string, en: string) => locale === "ko" ? ko : en;
  const baseCurrency = data.profile?.base_currency ?? "KRW";
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(() => localDate(data.profile?.timezone));
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
  const [detailsId,setDetailsId] = useState<string | null>(null);
  const [newRate, setNewRate] = useState("");
  const [newRateManual, setNewRateManual] = useState(false);
  const [newFee, setNewFee] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [loadingRates, setLoadingRates] = useState(false);
  const [rateMessage, setRateMessage] = useState("");
  const [baselineObservedOn, setBaselineObservedOn] = useState("");
  const [forecastObservedOn, setForecastObservedOn] = useState("");
  const [baselineManual, setBaselineManual] = useState(false);
  const [forecastManual, setForecastManual] = useState(false);
  const [newRateObservedOn, setNewRateObservedOn] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const today = localDate(data.profile?.timezone);
    if (currency === baseCurrency) {
      queueMicrotask(() => {
        if (controller.signal.aborted) return;
        setBaselineRate(""); setForecastRate("");
        setBaselineObservedOn(""); setForecastObservedOn("");
        setLoadingRates(false);
      });
      return () => controller.abort();
    }

    const estimateDate = date <= today ? date : today;
    const baselineRequest = fetchReferenceRate(currency, baseCurrency, estimateDate, controller.signal);
    const forecastRequest = estimateDate === today
      ? baselineRequest
      : fetchReferenceRate(currency, baseCurrency, today, controller.signal);
    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      setBaselineManual(false); setForecastManual(false); setRateMessage("");
      setBaselineRate(""); setForecastRate("");
      setBaselineObservedOn(""); setForecastObservedOn(""); setLoadingRates(true);
    });
    void Promise.all([baselineRequest, forecastRequest]).then(([baseline, forecast]) => {
      setBaselineRate(baseline.rate); setBaselineObservedOn(baseline.observedOn);
      setForecastRate(forecast.rate); setForecastObservedOn(forecast.observedOn);
    }).catch((error: unknown) => {
      if (error instanceof Error && error.name === "AbortError") return;
      setRateMessage("Automatic exchange rates could not be loaded. Enter a rate manually or try again.");
    }).finally(() => {
      if (!controller.signal.aborted) setLoadingRates(false);
    });
    return () => controller.abort();
  }, [baseCurrency, currency, date, data.profile?.timezone]);

  useEffect(() => {
    if (!editingId) return;
    const plan = data.plans.find((item) => item.id === editingId);
    if (!plan || plan.currency_code === plan.base_currency) return;
    const controller = new AbortController();
    const today = localDate(data.profile?.timezone);
    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      setNewRate(""); setNewRateObservedOn(""); setNewRateManual(false);
    });
    void fetchReferenceRate(plan.currency_code, plan.base_currency, today, controller.signal).then((quote) => {
      setNewRate(quote.rate); setNewRateObservedOn(quote.observedOn);
    }).catch(() => {
      if (!controller.signal.aborted) setMessage("Automatic exchange rates could not be loaded. Enter a rate manually or try again.");
    });
    return () => controller.abort();
  }, [editingId, data.plans, data.profile?.timezone]);

  async function insertRate(from: CurrencyCode, to: CurrencyCode, rate: string, purpose: "baseline_plan" | "forecast", observedOn: string, sourceLabel: string) {
    const result = await supabase.from("fx_snapshots").insert({
      user_id: userId, from_currency: from, to_currency: to, rate,
      observed_on: observedOn, purpose, source_label: sourceLabel,
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
      (currency !== baseCurrency && (!parseRate(baselineRate) || !parseRate(forecastRate) || !baselineObservedOn || !forecastObservedOn))) {
      setMessage("Check the title, date, amounts, and both FX rates for a foreign-currency plan."); return;
    }
    const selectedKind = kinds.find((item) => item.value === kind);
    if (!selectedKind) return;
    setPending(true);
    try {
      const baselineId = currency === baseCurrency ? null : await insertRate(currency, baseCurrency, baselineRate, "baseline_plan", baselineObservedOn, baselineManual ? "Manual rate override" : "Frankfurter public blended mid-market reference rate");
      const forecastId = currency === baseCurrency ? null : await insertRate(currency, baseCurrency, forecastRate, "forecast", forecastObservedOn, forecastManual ? "Manual rate override" : "Frankfurter public blended mid-market reference rate");
      const { error } = await supabase.from("plans").insert({
        user_id: userId, title: title.trim(), scheduled_date: date, direction: selectedKind.direction, entry_kind: kind,
        category_id: categoryId || null, account_id: accountId || null,
        original_amount_minor: Number(original), currency_code: currency, base_currency: baseCurrency,
        baseline_fx_snapshot_id: baselineId, forecast_fx_snapshot_id: forecastId,
        baseline_fee_minor: Number(baselineFeeMinor), forecast_fee_minor: Number(forecastFeeMinor), status: "pending",
      });
      if (error) throw new Error("Plan could not be saved.");
      setTitle(""); setAmount(""); setBaselineRate(""); setForecastRate(""); setBaselineFee(""); setForecastFee(""); setBaselineObservedOn(""); setForecastObservedOn("");
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
        await insertRate(plan.currency_code, plan.base_currency, newRate, "forecast", newRateObservedOn, newRateManual ? "Manual rate override" : "Frankfurter public blended mid-market reference rate");
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
    <h2 className="text-lg font-semibold">{t("Plans")}</h2>
    <p className="mt-1 text-sm text-slate-500">{t("Reporting currency:")}{" "}{baseCurrency}{t(". Automatic reference rates are saved as fixed snapshots.")}</p>
    <form onSubmit={submit} className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="text-sm lg:col-span-2">{t("Title")}<input required maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
      <label className="text-sm">{t("Due date")}<input required type="date" value={date} onChange={(event) => setDate(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
      <label className="text-sm">{t("Type")}<select value={kind} onChange={(event) => setKind(event.target.value as EntryKind)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2">{kinds.map((item) => <option key={item.value} value={item.value}>{t(item.label)}</option>)}</select></label>
      <label className="text-sm">{t("Original amount")}<input required inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
      <label className="text-sm">{t("Currency")}<select value={currency} onChange={(event) => setCurrency(event.target.value as CurrencyCode)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2">{supportedCurrencies.map((code) => <option key={code}>{code}</option>)}</select></label>
      <label className="text-sm">{t("Category")}<select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="">{t("Uncategorized")}</option>{data.categories.filter((category) => category.is_active && category.normal_direction === kinds.find((item) => item.value === kind)?.direction).map((category) => <option key={category.id} value={category.id}>{category.major_name} / {category.name}</option>)}</select></label>
      <label className="text-sm">{t("Expected account")}<select value={accountId} onChange={(event) => setAccountId(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="">{t("Unassigned")}</option>{data.accounts.filter((account) => account.is_active).map((account) => <option key={account.id} value={account.id}>{account.name} ({account.currency_code})</option>)}</select></label>
      {currency !== baseCurrency && <><label className="text-sm">{text("최초 예상 환율", "Original estimate rate")} · 1 {currency} = ? {baseCurrency}<input required inputMode="decimal" value={baselineRate} onChange={(event) => { setBaselineManual(true); setBaselineRate(event.target.value); setBaselineObservedOn(localDate(data.profile?.timezone)); }} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" />{baselineObservedOn && <span className="mt-1 block text-xs text-slate-500">{text(baselineManual ? "직접 입력일" : "공표일", baselineManual ? "Manual entry date" : "Published")}: {baselineObservedOn}{baselineManual ? text(" · 직접 수정", " · manually adjusted") : " · Frankfurter"}</span>}</label><label className="text-sm">{text("현재 예상 환율", "Current forecast rate")} · 1 {currency} = ? {baseCurrency}<input required inputMode="decimal" value={forecastRate} onChange={(event) => { setForecastManual(true); setForecastRate(event.target.value); setForecastObservedOn(localDate(data.profile?.timezone)); }} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" />{forecastObservedOn && <span className="mt-1 block text-xs text-slate-500">{text(forecastManual ? "직접 입력일" : "공표일", forecastManual ? "Manual entry date" : "Published")}: {forecastObservedOn}{forecastManual ? text(" · 직접 수정", " · manually adjusted") : " · Frankfurter"}</span>}</label></>}
      <label className="text-sm">{t("Baseline separate fee (")}{baseCurrency})<input inputMode="decimal" value={baselineFee} onChange={(event) => setBaselineFee(event.target.value)} placeholder="0" className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
      <label className="text-sm">{t("Forecast separate fee (")}{baseCurrency})<input inputMode="decimal" value={forecastFee} onChange={(event) => setForecastFee(event.target.value)} placeholder="0" className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
      <div className="flex items-end"><button disabled={pending || loadingRates} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{loadingRates ? text("환율 불러오는 중…", "Loading exchange rates…") : t("Save plan")}</button></div>
    </form>
    {currency !== baseCurrency && <p className="mt-3 text-sm text-slate-600">{loadingRates ? text("환율 제공처에서 환율을 불러오고 있습니다.", "Fetching reference rates…") : text("과거 예정일의 최초 예상은 해당일 이전의 최근 공표 환율을 사용합니다. 오늘 이후 예정일은 오늘 이용 가능한 환율을 사용합니다. 현재 예상은 항상 오늘 이용 가능한 최신 환율입니다. 두 환율은 저장 후 고정됩니다. 은행 실제 적용 환율과 다를 수 있습니다.", "For a past due date, the original estimate uses the latest published rate on or before that date. For today or a future date, it uses the latest rate available today. The current forecast always uses today's latest available rate. Both rates are saved as fixed snapshots and may differ from your bank's rate.")}</p>}
    {rateMessage && <p role="alert" className="mt-3 text-sm text-amber-800">{t(rateMessage)}</p>}
    {message && <p role="status" className="mt-3 text-sm text-slate-600">{t(message)}</p>}
    <div className="mt-5 flex justify-end"><SortControl label={locale === "ko" ? "정렬" : "Sort"} value={sortOrder} onChange={onSortChange} options={[
      { value: "date-asc", label: locale === "ko" ? "예정일 · 빠른 순" : "Due date · soonest first" },
      { value: "date-desc", label: locale === "ko" ? "예정일 · 늦은 순" : "Due date · latest first" },
      { value: "title", label: locale === "ko" ? "내용 · ㄱ-ㅎ / A-Z" : "Title · A-Z" },
      { value: "amount-asc", label: locale === "ko" ? "금액 · 통화별 낮은 순" : "Amount · low within currency" },
      { value: "amount-desc", label: locale === "ko" ? "금액 · 통화별 높은 순" : "Amount · high within currency" },
      { value: "status", label: locale === "ko" ? "상태 · ㄱ-ㅎ / A-Z" : "Status · A-Z" },
    ]} /></div>
    <div className="mt-6 overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase text-slate-500"><tr><th className="pb-2">{t("Due")}</th><th className="pb-2">{t("Plan")}</th><th className="pb-2">{t("Status")}</th><th className="pb-2 text-right">{t("Original")}</th><th className="pb-2 text-right">{t("Baseline")}</th><th className="pb-2 text-right">{t("Current")}</th><th className="pb-2 text-right">{t("Review")}</th></tr></thead><tbody>{data.plans.map((plan) => { const costs = planCosts(plan, data.rates); return <Fragment key={plan.id}><tr className="border-b border-slate-100 align-top"><td className="py-3">{plan.scheduled_date}</td><td className="py-3">{plan.title}</td><td className="py-3">{t(effectiveStatus(plan, data))}</td><td className="py-3 text-right">{formatMinor(BigInt(plan.original_amount_minor), plan.currency_code)}</td><td className="py-3 text-right">{costs.baseline === null ? t("Rate missing") : formatMinor(costs.baseline, plan.base_currency)}</td><td className="py-3 text-right">{costs.forecast === null ? t("Rate missing") : formatMinor(costs.forecast, plan.base_currency)}</td><td className="py-3 text-right"><button type="button" disabled={pending || detailsId !== null} onClick={() => setDetailsId(plan.id)} className="mb-2 mr-3 rounded border px-3 py-1">{text("정보 수정","Edit details")}</button>{editingId === plan.id ? <div className="space-y-2"><input aria-label={t("New forecast rate")} value={newRate} onChange={(event) => { setNewRateManual(true); setNewRate(event.target.value); setNewRateObservedOn(localDate(data.profile?.timezone)); }} placeholder={plan.currency_code === plan.base_currency ? t("Rate not needed") : t("New rate")} className="w-28 rounded border px-2 py-1" />{newRateObservedOn && <span className="block text-xs text-slate-500">{text("공표일 / 직접 입력일", "Rate date")}: {newRateObservedOn}{newRateManual ? text(" · 직접 수정", " · manually adjusted") : " · Frankfurter"}</span>}<input aria-label={t("New forecast fee")} value={newFee} onChange={(event) => setNewFee(event.target.value)} placeholder={t("Fee")} className="w-24 rounded border px-2 py-1" /><button type="button" disabled={pending || !newRate || !newRateObservedOn} onClick={() => reviseForecast(plan)} className="block text-slate-900 underline">{t("Save forecast")}</button></div> : <button type="button" onClick={() => { setEditingId(plan.id); setNewRate(""); setNewRateObservedOn(""); setNewRateManual(false); setNewFee(String(plan.forecast_fee_minor / (plan.base_currency === "KRW" ? 1 : 100))); }} className="underline">{t("Revise FX / fee")}</button>}</td></tr>{detailsId === plan.id && <tr><td colSpan={7}><PlanDetailsEditor plan={plan} data={data} userId={userId} supabase={supabase} onCancel={() => setDetailsId(null)} onSaved={async () => { setDetailsId(null); await refresh(); }} /></td></tr>}</Fragment>; })}</tbody></table>{data.plans.length === 0 && <p className="py-5 text-sm text-slate-500">{t("No plans yet.")}</p>}</div>
  </section>;
}
