"use client";
import { localDate } from "@/lib/finance/local-date";
import { useLanguage } from "@/lib/i18n/provider";

import { useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decimalAmountFromMinor, formatMinor, parseAmountToMinor, parseRate, safeMinorNumber, type CurrencyCode } from "@/lib/finance/money";
import { nextUnproposedDate } from "@/lib/finance/recurrence";
import type { EntryKind, WorkspaceData, RecurringTemplateRow } from "@/lib/finance/records";
import SortControl from "./sort-control";
import { CurrencySelect } from "./currency-select";

const kinds: { value: EntryKind; label: string; direction: "inflow" | "outflow" }[] = [
  { value: "income", label: "Income", direction: "inflow" },
  { value: "expense", label: "Expense", direction: "outflow" },
  { value: "loan_drawdown", label: "Loan drawdown", direction: "inflow" },
  { value: "loan_principal", label: "Loan principal", direction: "outflow" },
  { value: "loan_interest", label: "Loan interest", direction: "outflow" },
];

export default function RecurringPanel({ data, userId, supabase, refresh, sortOrder, onSortChange }: {
  data: WorkspaceData; userId: string; supabase: SupabaseClient; refresh: () => Promise<void>; sortOrder: string; onSortChange: (value: string) => void;
}) {
  const { t,locale } = useLanguage();
  const text = (ko: string,en: string) => locale === "ko" ? ko : en;
  const [editing,setEditing] = useState<RecurringTemplateRow | null>(null);
  const [showInactive,setShowInactive] = useState(false);
  const baseCurrency = data.profile?.base_currency ?? "KRW";
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(() => localDate(data.profile?.timezone));
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
    const payload = {
      title: title.trim(), next_date: date, cadence,
      anchor_month: Number(date.slice(5, 7)), anchor_day: Number(date.slice(8, 10)),
      direction, entry_kind: kind, category_id: categoryId || null, account_id: accountId || null,
      original_amount_minor: Number(minor), currency_code: currency,
    };
    const result = editing ? await supabase.from("recurring_templates").update(payload).eq("user_id",userId).eq("id",editing.id).eq("title",editing.title).eq("next_date",editing.next_date).eq("original_amount_minor",editing.original_amount_minor).select("id") : await supabase.from("recurring_templates").insert({ ...payload,user_id: userId,is_active: true }).select("id");
    setPending(false);
    if (result.error || !result.data?.length) { setMessage(text("저장하지 못했습니다. 다른 화면의 변경이나 입력값을 확인하세요.","Not saved. Check concurrent changes or inputs.")); return; }
    setEditing(null); setTitle(""); setAmount(""); setMessage("Template saved. It creates only proposed plans when you confirm them.");
    await refresh();
  }
  async function toggle(item: RecurringTemplateRow) {
    setPending(true);
    const result = await supabase.from("recurring_templates").update({ is_active: !item.is_active }).eq("user_id",userId).eq("id",item.id).eq("is_active",item.is_active).select("id");
    setPending(false);
    if (result.error || !result.data?.length) setMessage(text("변경하지 못했습니다. 다시 불러오세요.","Not changed. Reload.")); else { setSelectedId(""); await refresh(); }
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
      setMessage("Proposed plan saved. No actual settlement was created.");
      await refresh();
    } catch { setMessage("Proposed plan could not be saved. Check for an existing occurrence."); }
    finally { setPending(false); }
  }

  return <section id="recurring" className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
    <h2 className="text-lg font-semibold">{t("Recurring plans")}</h2><p className="mt-1 text-sm text-slate-500">{text("반복 양식은 다음 계획만 제안합니다. 항목을 중지해도 이미 만든 계획은 그대로 남고, 제안만 멈춥니다.","Templates only suggest future plans. Pausing one stops new suggestions; existing plans remain unchanged.")}</p>
    {editing && <p className="mt-3 rounded bg-amber-50 p-3 text-sm">{text("정기 항목 수정 중입니다. 수정은 이후 제안에만 적용되며 이미 생성된 계획이나 거래는 바꾸지 않습니다.","Editing this template affects future proposals, not plans or transactions already created.")}</p>}
    <form onSubmit={createTemplate} className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="text-sm lg:col-span-2">{t("Title")}<input required value={title} onChange={(event) => setTitle(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
      <label className="text-sm">{t("First date")}<input required type="date" value={date} onChange={(event) => setDate(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
      <label className="text-sm">{t("Cadence")}<select value={cadence} onChange={(event) => setCadence(event.target.value as typeof cadence)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="weekly">{t("Weekly")}</option><option value="monthly">{t("Monthly")}</option><option value="yearly">{t("Yearly")}</option></select></label>
      <label className="text-sm">{t("Type")}<select value={kind} onChange={(event) => setKind(event.target.value as EntryKind)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2">{kinds.map((item) => <option key={item.value} value={item.value}>{t(item.label)}</option>)}</select></label>
      <label className="text-sm">{t("Amount")}<input required inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
      <label className="text-sm">{t("Currency")}<CurrencySelect value={currency} onChange={setCurrency} locale={locale} className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2" /></label>
      <label className="text-sm">{t("Category")}<select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="">{t("Uncategorized")}</option>{data.categories.filter((category) => category.is_active && category.normal_direction === kinds.find((item) => item.value === kind)?.direction).map((category) => <option key={category.id} value={category.id}>{category.major_name} / {category.name}</option>)}</select></label>
      <label className="text-sm">{t("Account")}<select value={accountId} onChange={(event) => setAccountId(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="">{t("Unassigned")}</option>{data.accounts.filter((account) => account.is_active).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
      <div className="flex items-end"><button disabled={pending} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{editing ? text("수정 저장","Save changes") : t("Save template")}</button>{editing && <button type="button" onClick={() => { setEditing(null); setTitle(""); setAmount(""); }} className="ml-3 underline">{text("취소","Cancel")}</button>}</div>
    </form>
    <div className="mt-4 flex justify-end"><SortControl label={text("정렬","Sort")} value={sortOrder} onChange={onSortChange} options={[
      { value: "date-asc", label: text("다음 날짜 · 빠른 순", "Next date · soonest first") },
      { value: "date-desc", label: text("다음 날짜 · 늦은 순", "Next date · latest first") },
      { value: "title", label: text("이름 · ㄱ-ㅎ / A-Z", "Name · A-Z") },
      { value: "amount-asc", label: text("금액 · 통화별 낮은 순", "Amount · low within currency") },
      { value: "amount-desc", label: text("금액 · 통화별 높은 순", "Amount · high within currency") },
      { value: "cadence", label: text("주기", "Frequency") },
    ]} /></div>
    <div className="mt-6 grid gap-4 lg:grid-cols-2"><div><h3 className="text-sm font-semibold">{t("Templates")}</h3><label className="my-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />{text("중지한 항목 포함","Include paused templates")}</label><ul className="mt-2 divide-y divide-slate-100">{data.recurringTemplates.filter((item) => showInactive || item.is_active).map((item) => <li key={item.id} className="flex items-center justify-between gap-4 py-3 text-sm"><span>{item.title} · {t(item.cadence)}<br /><span className="text-slate-500">{formatMinor(BigInt(item.original_amount_minor), item.currency_code)}</span></span><div className="flex flex-wrap gap-3"><button type="button" disabled={pending || editing !== null || !item.is_active} onClick={() => setSelectedId(item.id)} className="underline disabled:opacity-50">{t("Propose")}</button><button type="button" disabled={pending || editing !== null} onClick={() => { setEditing(item); setSelectedId(""); setTitle(item.title); setDate(item.next_date); setCadence(item.cadence); setKind(item.entry_kind); setAmount(decimalAmountFromMinor(item.original_amount_minor, item.currency_code)); setCurrency(item.currency_code); setCategoryId(item.category_id ?? ""); setAccountId(item.account_id ?? ""); }} className="underline">{text("수정","Edit")}</button><button type="button" disabled={pending || editing !== null} onClick={() => void toggle(item)} className="underline">{item.is_active ? text("정기 제안 중지","Pause future proposals") : text("제안 재개","Resume proposals")}</button></div></li>)}</ul></div>{selected && proposedDate && <div className="rounded-xl bg-slate-50 p-4"><h3 className="font-semibold">{t("Review proposed plan")}</h3><p className="mt-1 text-sm">{selected.title} · {proposedDate} · {formatMinor(BigInt(selected.original_amount_minor), selected.currency_code)}</p>{selected.currency_code !== baseCurrency && <div className="mt-3 grid grid-cols-2 gap-2"><label className="text-sm">{t("Baseline FX")}<input required inputMode="decimal" value={baselineRate} onChange={(event) => setBaselineRate(event.target.value)} className="mt-1 block w-full rounded border px-2 py-1" /></label><label className="text-sm">{t("Current FX")}<input required inputMode="decimal" value={forecastRate} onChange={(event) => setForecastRate(event.target.value)} className="mt-1 block w-full rounded border px-2 py-1" /></label></div>}<div className="mt-3 grid grid-cols-2 gap-2"><label className="text-sm">{t("Baseline fee (")}{baseCurrency})<input inputMode="decimal" value={baselineFee} onChange={(event) => setBaselineFee(event.target.value)} placeholder="0" className="mt-1 block w-full rounded border px-2 py-1" /></label><label className="text-sm">{t("Forecast fee (")}{baseCurrency})<input inputMode="decimal" value={forecastFee} onChange={(event) => setForecastFee(event.target.value)} placeholder="0" className="mt-1 block w-full rounded border px-2 py-1" /></label></div><button type="button" disabled={pending} onClick={confirmProposal} className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50">{t("Confirm proposed plan")}</button></div>}</div>
    {message && <p role="status" className="mt-3 text-sm text-slate-600">{t(message)}</p>}
  </section>;
}
