"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import ActualsPanel, { type PlanOption } from "../actuals-panel";
import {
  convertToBaseMinor,
  formatMinor,
  parseAmountToMinor,
  parseRate,
  supportedCurrencies,
  type CurrencyCode,
} from "@/lib/finance/money";
import { CurrencySelect } from "../workspace/currency-select";

type Direction = "Outflow" | "Inflow";
type Draft = {
  id: number;
  title: string;
  amountMinor: string;
  currency: CurrencyCode;
  date: string;
  direction: Direction;
  category: string;
  baseCurrency: CurrencyCode;
  baselineRate: string;
  forecastRate: string;
  baselineFeeMinor: string;
  forecastFeeMinor: string;
};

const categories = ["Academic", "Housing", "Living", "Supplies", "Financial / Loan", "Buffer", "Other"];
const localDraftsKey = "study-finance-local-plans-v2";

function isDraft(value: unknown): value is Draft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<Draft>;
  if (typeof draft.id !== "number" || !Number.isSafeInteger(draft.id) ||
    typeof draft.title !== "string" || typeof draft.date !== "string" ||
    typeof draft.category !== "string" || typeof draft.amountMinor !== "string" ||
    typeof draft.baselineRate !== "string" || typeof draft.forecastRate !== "string" ||
    typeof draft.baselineFeeMinor !== "string" || typeof draft.forecastFeeMinor !== "string" ||
    !supportedCurrencies.includes(draft.currency as CurrencyCode) ||
    !supportedCurrencies.includes(draft.baseCurrency as CurrencyCode) ||
    (draft.direction !== "Inflow" && draft.direction !== "Outflow")) return false;
  return /^(0|[1-9]\d*)$/.test(draft.amountMinor) && BigInt(draft.amountMinor) > BigInt(0) &&
    /^(0|[1-9]\d*)$/.test(draft.baselineFeeMinor) && /^(0|[1-9]\d*)$/.test(draft.forecastFeeMinor) &&
    parseRate(draft.baselineRate) !== null && parseRate(draft.forecastRate) !== null;
}

function suggestCategory(title: string, direction: Direction) {
  const value = title.toLowerCase();
  if (direction === "Inflow") return "Income";
  if (/tuition|ucl|uos|학비|등록금|수업료/.test(value)) return "Academic";
  if (/rent|숙소|기숙사|housing|월세/.test(value)) return "Housing";
  if (/market|food|grocery|식비|장보기|먹/.test(value)) return "Living";
  if (/laptop|desk|stationery|supplies|준비물|비품|amazon/.test(value)) return "Supplies";
  if (/loan|interest|repayment|대출|이자|상환/.test(value)) return "Financial / Loan";
  return "Other";
}

export default function Home() {
  const [direction, setDirection] = useState<Direction>("Outflow");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode>("GBP");
  const [baseCurrency, setBaseCurrency] = useState<CurrencyCode>("GBP");
  const [category, setCategory] = useState("Other");
  const [baselineRate, setBaselineRate] = useState("");
  const [forecastRate, setForecastRate] = useState("");
  const [baselineFee, setBaselineFee] = useState("");
  const [forecastFee, setForecastFee] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [draftsHydrated, setDraftsHydrated] = useState(false);
  const [message, setMessage] = useState("");

  const suggestion = useMemo(() => suggestCategory(title, direction), [title, direction]);
  const requiresRate = currency !== baseCurrency;

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(localDraftsKey);
      if (stored) {
        const parsed = JSON.parse(stored) as unknown;
        if (Array.isArray(parsed)) startTransition(() => setDrafts(parsed.filter(isDraft)));
      }
    } catch {
      startTransition(() => setMessage("이 브라우저의 로컬 초안을 읽지 못했습니다."));
    } finally {
      setDraftsHydrated(true);
    }
  }, []);

  function handleTitleChange(value: string) {
    setTitle(value);
    if (category === "Other" || category === suggestion) setCategory(suggestCategory(value, direction));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draftsHydrated) return;
    const amountMinor = parseAmountToMinor(amount, currency);
    const baselineFeeMinor = parseAmountToMinor(baselineFee || "0", baseCurrency);
    const forecastFeeMinor = parseAmountToMinor(forecastFee || "0", baseCurrency);
    const effectiveBaselineRate = requiresRate ? baselineRate : "1";
    const effectiveForecastRate = requiresRate ? forecastRate : "1";
    if (!title.trim() || !amountMinor || amountMinor <= BigInt(0) || baselineFeeMinor === null || forecastFeeMinor === null ||
      convertToBaseMinor(amountMinor, currency, baseCurrency, effectiveBaselineRate) === null ||
      convertToBaseMinor(amountMinor, currency, baseCurrency, effectiveForecastRate) === null) {
      setMessage("내용·금액을 확인하고, 환전 계획은 기준 환율과 최신 전망 환율을 모두 입력해 주세요.");
      return;
    }
    const nextDrafts = [
      {
        id: Date.now(), title: title.trim(), amountMinor: amountMinor.toString(), currency, date, direction, category,
        baseCurrency, baselineRate: effectiveBaselineRate, forecastRate: effectiveForecastRate,
        baselineFeeMinor: baselineFeeMinor.toString(), forecastFeeMinor: forecastFeeMinor.toString(),
      },
      ...drafts,
    ];
    try {
      window.localStorage.setItem(localDraftsKey, JSON.stringify(nextDrafts));
    } catch {
      setMessage("이 브라우저에 계획 초안을 저장하지 못했습니다. 저장 공간을 확인해 주세요.");
      return;
    }
    setDrafts(nextDrafts);
    setMessage("계획 초안이 브라우저에 저장되었습니다. 원본 금액, 기준 환율, 최신 전망은 각각 분리되어 있습니다.");
    setTitle("");
    setAmount("");
    setCategory("Other");
    setBaselineRate("");
    setForecastRate("");
    setBaselineFee("");
    setForecastFee("");
  }

  const planOptions: PlanOption[] = drafts.map((draft) => {
    const converted = convertToBaseMinor(BigInt(draft.amountMinor), draft.currency, draft.baseCurrency, draft.forecastRate);
    return {
      id: draft.id, title: draft.title, date: draft.date, direction: draft.direction,
      currency: draft.currency, baseCurrency: draft.baseCurrency, originalAmountMinor: draft.amountMinor,
      forecastCostMinor: (converted === null ? BigInt(0) : converted + BigInt(draft.forecastFeeMinor)).toString(),
    };
  });

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <div className="mx-auto flex min-h-screen max-w-[1440px]">
        <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white p-6 lg:block">
          <div className="text-sm font-semibold tracking-tight">Study Finance</div>
          <p className="mt-1 text-xs text-slate-500">Browser-only demo</p>
          <nav className="mt-10 space-y-1 text-sm">
            <a className="block rounded-lg bg-slate-900 px-3 py-2 font-medium text-white" href="#overview">Overview</a>
            <a className="block rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-100" href="#quick-entry">Quick entry</a>
            <a className="block rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-100" href="#plans">Plans</a>
            <a className="block rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-100" href="#actuals">Actuals</a>
          </nav>
          <div className="mt-auto pt-16 text-xs leading-5 text-slate-500">
            <p className="font-medium text-slate-700">Manual-first</p>
            <p>환율과 실제 정산액은 자동으로 덮어쓰지 않습니다.</p>
          </div>
        </aside>

        <section className="min-w-0 flex-1 p-5 sm:p-8">
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-slate-500">Local finance workspace</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight">Cash-flow overview</h1>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 ring-1 ring-amber-200">Browser-only demo</span>
              <a href="/login" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700">Sign in</a>
            </div>
          </header>

          <p role="note" className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
            데모 전용입니다. 실제 금융정보를 입력하지 마세요. 입력 내용은 계정 보호나 백업 없이 이 브라우저에만 저장됩니다. / Demo only. Do not enter real financial data. Entries stay in this browser without account protection or backup.
          </p>

          <div id="overview" className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["Available cash", "Not connected", "Connect an account to calculate"],
              ["Next 30 days planned outflow", "—", "No records yet"],
              ["Lowest forecast balance", "—", "3-month horizon"],
              ["Needs review", String(drafts.length), "Local drafts"],
            ].map(([label, value, note]) => (
              <div key={label} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                <p className="text-sm text-slate-500">{label}</p>
                <p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p>
                <p className="mt-2 text-xs text-slate-500">{note}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(360px,0.8fr)]">
            <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-semibold">Cash-flow timeline</h2>
                  <p className="mt-1 text-sm text-slate-500">Forecast appears after the first plan is saved.</p>
                </div>
              </div>
              <div className="mt-8 flex h-48 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-center text-sm text-slate-500">
                Add planned income and outflow to see the balance path.
              </div>
            </section>

            <section id="quick-entry" className="rounded-2xl bg-slate-900 p-6 text-white shadow-sm">
              <div>
                <h2 className="font-semibold">Plan draft</h2>
                <p className="mt-1 text-sm text-slate-300">내용과 금액만 입력해도 분류를 제안합니다.</p>
              </div>
              <form className="mt-5 space-y-3" onSubmit={submit}>
                <div className="grid grid-cols-2 gap-2">
                  {(["Outflow", "Inflow"] as Direction[]).map((item) => (
                    <button key={item} type="button" onClick={() => setDirection(item)} className={`rounded-lg px-3 py-2 text-sm font-medium ${direction === item ? "bg-white text-slate-900" : "bg-white/10 text-slate-300"}`}>
                      {item === "Outflow" ? "지출 예정" : "수입 예정"}
                    </button>
                  ))}
                </div>
                <input value={title} onChange={(event) => handleTitleChange(event.target.value)} placeholder="예: Market groceries" className="w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2.5 text-sm outline-none placeholder:text-slate-400 focus:border-white/50" />
                <div className="grid grid-cols-[1fr_88px] gap-2">
                  <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="금액" className="w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2.5 text-sm outline-none placeholder:text-slate-400 focus:border-white/50" />
                  <CurrencySelect value={currency} onChange={setCurrency} locale="en" className="rounded-lg border border-white/15 bg-slate-800 px-2 py-2.5 text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="rounded-lg border border-white/15 bg-white/10 px-3 py-2.5 text-sm" />
                  <select value={category} onChange={(event) => setCategory(event.target.value)} className="rounded-lg border border-white/15 bg-slate-800 px-2 py-2.5 text-sm">
                    {categories.map((item) => <option key={item}>{item}</option>)}
                    {direction === "Inflow" && <option>Income</option>}
                  </select>
                </div>
                <label className="block text-xs text-slate-300">
                  Reporting base currency
                  <CurrencySelect value={baseCurrency} onChange={setBaseCurrency} locale="en" className="w-full rounded-lg border border-white/15 bg-slate-800 px-2 py-2.5 text-sm" />
                </label>
                {requiresRate && <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs text-slate-300">Baseline FX rate<input required value={baselineRate} onChange={(event) => setBaselineRate(event.target.value)} inputMode="decimal" placeholder={`1 ${currency} = ? ${baseCurrency}`} className="mt-1 w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2.5 text-sm" /></label>
                  <label className="text-xs text-slate-300">Current FX rate<input required value={forecastRate} onChange={(event) => setForecastRate(event.target.value)} inputMode="decimal" placeholder={`1 ${currency} = ? ${baseCurrency}`} className="mt-1 w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2.5 text-sm" /></label>
                </div>}
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs text-slate-300">Baseline separate fee ({baseCurrency})<input value={baselineFee} onChange={(event) => setBaselineFee(event.target.value)} inputMode="decimal" placeholder="0" className="mt-1 w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2.5 text-sm" /></label>
                  <label className="text-xs text-slate-300">Forecast separate fee ({baseCurrency})<input value={forecastFee} onChange={(event) => setForecastFee(event.target.value)} inputMode="decimal" placeholder="0" className="mt-1 w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2.5 text-sm" /></label>
                </div>
                <p className="text-xs text-slate-300">Suggestion: <span className="font-medium text-white">{suggestion}</span></p>
                <button disabled={!draftsHydrated} type="submit" className="w-full rounded-lg bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-100 disabled:opacity-50">Save plan draft</button>
                {message && <p className="text-xs text-slate-300" role="status">{message}</p>}
              </form>
            </section>
          </div>

          <section id="plans" className="mt-6 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <div className="flex items-center justify-between gap-3">
              <div><h2 className="font-semibold">Upcoming plans</h2><p className="mt-1 text-sm text-slate-500">Baseline and current forecast remain separate; fees are shown only when separately charged.</p></div>
            </div>
            <div className="mt-5 overflow-x-auto">
              {drafts.length === 0 ? <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500">No planned events yet. Use Quick entry to add one.</p> : <table className="w-full min-w-[820px] text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><tr><th className="pb-3 font-medium">Date</th><th className="pb-3 font-medium">Description</th><th className="pb-3 font-medium">Category</th><th className="pb-3 text-right font-medium">Original</th><th className="pb-3 text-right font-medium">Baseline cost</th><th className="pb-3 text-right font-medium">Current forecast</th></tr></thead><tbody>{drafts.map((item) => {
                const originalAmount = BigInt(item.amountMinor);
                const baseline = convertToBaseMinor(originalAmount, item.currency, item.baseCurrency, item.baselineRate);
                const forecast = convertToBaseMinor(originalAmount, item.currency, item.baseCurrency, item.forecastRate);
                const baselineCost = baseline === null ? null : baseline + BigInt(item.baselineFeeMinor);
                const forecastCost = forecast === null ? null : forecast + BigInt(item.forecastFeeMinor);
                return <tr key={item.id} className="border-b border-slate-100 last:border-0"><td className="py-3 text-slate-500">{item.date}</td><td className="py-3 font-medium">{item.title}</td><td className="py-3"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs">{item.category}</span></td><td className="py-3 text-right font-medium">{item.direction === "Inflow" ? "+" : "−"}{formatMinor(originalAmount, item.currency)}</td><td className="py-3 text-right font-medium">{baselineCost === null ? "Rate needed" : formatMinor(baselineCost, item.baseCurrency)}</td><td className="py-3 text-right font-medium">{forecastCost === null ? "Rate needed" : formatMinor(forecastCost, item.baseCurrency)}</td></tr>;
              })}</tbody></table>}
            </div>
          </section>
          <ActualsPanel plans={planOptions} />
        </section>
      </div>
    </main>
  );
}
