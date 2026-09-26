"use client";

import { startTransition, useEffect, useState, type FormEvent } from "react";
import { formatMinor, parseAmountToMinor, supportedCurrencies, type CurrencyCode } from "@/lib/finance/money";
import {
  actualCostMinor,
  cashEffectMinor,
  createReversal,
  isSettlement,
  validateSettlement,
  type Direction,
  type FeeTreatment,
  type Settlement,
  type SettlementInput,
} from "@/lib/finance/settlement";

export type PlanOption = {
  id: number;
  title: string;
  date: string;
  direction: Direction;
  currency: CurrencyCode;
  baseCurrency: CurrencyCode;
  originalAmountMinor: string;
  forecastCostMinor: string;
};

const storageKey = "study-finance-local-settlements-v1";

export default function ActualsPanel({ plans }: { plans: PlanOption[] }) {
  const [records, setRecords] = useState<Settlement[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [message, setMessage] = useState("");
  const [planId, setPlanId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [direction, setDirection] = useState<Direction>("Outflow");
  const [originalAmount, setOriginalAmount] = useState("");
  const [originalCurrency, setOriginalCurrency] = useState<CurrencyCode>("GBP");
  const [settlementAmount, setSettlementAmount] = useState("");
  const [settlementCurrency, setSettlementCurrency] = useState<CurrencyCode>("GBP");
  const [feeTreatment, setFeeTreatment] = useState<FeeTreatment>("included");
  const [separateFee, setSeparateFee] = useState("");
  const [observedFxRate, setObservedFxRate] = useState("");
  const [reverseConfirmId, setReverseConfirmId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        if (Array.isArray(parsed)) startTransition(() => setRecords(parsed.filter(isSettlement)));
      }
    } catch {
      startTransition(() => setMessage("Could not read the local settlement records in this browser."));
    } finally {
      startTransition(() => setHydrated(true));
    }
  }, []);

  const selectedPlan = plans.find((plan) => String(plan.id) === planId);

  function saveRecords(nextRecords: Settlement[]) {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(nextRecords));
    } catch {
      setMessage("This browser could not save the settlement record. Check available storage before entering more data.");
      return false;
    }
    setRecords(nextRecords);
    return true;
  }

  function reverseRecord(record: Settlement) {
    if (record.kind !== "settlement" || records.some((item) => item.correctionOfId === record.id)) return;
    const reversal = createReversal(record, crypto.randomUUID(), new Date().toISOString());
    if (saveRecords([reversal, ...records])) {
      setMessage("Reversal recorded. Add a new settlement if you need to replace the original.");
      setReverseConfirmId(null);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hydrated) return;
    const originalAmountMinor = parseAmountToMinor(originalAmount, originalCurrency);
    const settlementAmountMinor = parseAmountToMinor(settlementAmount, settlementCurrency);
    const explicitFeeMinor = parseAmountToMinor(feeTreatment === "separate" ? separateFee || "0" : "0", settlementCurrency);
    if (originalAmountMinor === null || settlementAmountMinor === null || explicitFeeMinor === null) {
      setMessage("Enter monetary amounts using the currency's allowed decimal places.");
      return;
    }
    if (selectedPlan && (selectedPlan.direction !== direction || selectedPlan.currency !== originalCurrency ||
      selectedPlan.baseCurrency !== settlementCurrency)) {
      setMessage("A linked settlement must match its plan's direction, original currency, and reporting currency.");
      return;
    }
    if (planId && !selectedPlan) {
      setMessage("The selected plan is no longer available.");
      return;
    }

    const input: SettlementInput = {
      kind: "settlement",
      correctionOfId: null,
      occurredOn: date,
      description: description.trim(),
      direction,
      planId: selectedPlan?.id ?? null,
      originalAmountMinor: originalAmountMinor.toString(),
      originalCurrency,
      settlementAmountMinor: settlementAmountMinor.toString(),
      settlementCurrency,
      feeTreatment,
      explicitFeeMinor: explicitFeeMinor.toString(),
      observedFxRate: originalCurrency === settlementCurrency || !observedFxRate.trim() ? null : observedFxRate.trim(),
    };
    const error = validateSettlement(input);
    if (error) {
      setMessage(error);
      return;
    }
    const nextRecords = [{ ...input, id: crypto.randomUUID(), recordedAt: new Date().toISOString() }, ...records];
    if (!saveRecords(nextRecords)) return;
    setMessage("Settlement recorded locally. Existing records cannot be edited from this screen.");
    setDescription("");
    setOriginalAmount("");
    setSettlementAmount("");
    setSeparateFee("");
    setObservedFxRate("");
    setPlanId("");
    setFeeTreatment("included");
  }

  return <section id="actuals" className="mt-6 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
    <h2 className="font-semibold">Actual settlements</h2>
    <p className="mt-1 text-sm text-slate-500">Record the original charge and the final account debit or credit. Enter a fee only when it appears as a separate charge.</p>
    <p className="mt-2 text-sm text-amber-800">Browser-only prototype: records stay in this browser and have no backup or account isolation. Use synthetic amounts until hosted storage is verified.</p>

    <form onSubmit={submit} className="mt-6 grid gap-4 lg:grid-cols-4">
      <label className="text-sm">Match a plan
        <select value={planId} onChange={(event) => setPlanId(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2">
          <option value="">Unmatched settlement</option>
          {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.date} · {plan.title}</option>)}
        </select>
      </label>
      <label className="text-sm">Settlement date<input required type="date" value={date} onChange={(event) => setDate(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
      <label className="text-sm lg:col-span-2">Description<input required maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
      <label className="text-sm">Cash direction<select value={direction} onChange={(event) => setDirection(event.target.value as Direction)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"><option>Outflow</option><option>Inflow</option></select></label>
      <label className="text-sm">Original amount<input required inputMode="decimal" value={originalAmount} onChange={(event) => setOriginalAmount(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
      <label className="text-sm">Original currency<select value={originalCurrency} onChange={(event) => setOriginalCurrency(event.target.value as CurrencyCode)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2">{supportedCurrencies.map((currency) => <option key={currency}>{currency}</option>)}</select></label>
      <label className="text-sm">Final account amount<input required inputMode="decimal" value={settlementAmount} onChange={(event) => setSettlementAmount(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
      <label className="text-sm">Account currency<select value={settlementCurrency} onChange={(event) => setSettlementCurrency(event.target.value as CurrencyCode)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2">{supportedCurrencies.map((currency) => <option key={currency}>{currency}</option>)}</select></label>
      <label className="text-sm">Fee on statement<select value={feeTreatment} onChange={(event) => setFeeTreatment(event.target.value as FeeTreatment)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="included">Included in final amount</option><option value="separate">Separate charge</option></select></label>
      {feeTreatment === "separate" && <label className="text-sm">Separate fee ({settlementCurrency})<input inputMode="decimal" value={separateFee} onChange={(event) => setSeparateFee(event.target.value)} placeholder="0" className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label>}
      {originalCurrency !== settlementCurrency && <label className="text-sm">Bank FX rate, if shown<input inputMode="decimal" value={observedFxRate} onChange={(event) => setObservedFxRate(event.target.value)} placeholder={`1 ${originalCurrency} = ? ${settlementCurrency}`} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label>}
      <div className="flex items-end lg:col-span-4"><button disabled={!hydrated} type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Record settlement</button></div>
    </form>
    {message && <p role="status" className="mt-3 text-sm text-slate-600">{message}</p>}

    <div className="mt-7 overflow-x-auto">
      {records.length === 0 ? <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500">No settlements recorded in this browser yet.</p> :
        <table className="w-full min-w-[1000px] text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><tr><th className="pb-3 font-medium">Date</th><th className="pb-3 font-medium">Description</th><th className="pb-3 font-medium">Original</th><th className="pb-3 text-right font-medium">Final account amount</th><th className="pb-3 text-right font-medium">Separate fee</th><th className="pb-3 text-right font-medium">Net cash effect</th><th className="pb-3 text-right font-medium">Correction</th></tr></thead><tbody>{records.map((record) => {
          const linkedPlan = plans.find((plan) => plan.id === record.planId);
          const actual = actualCostMinor(record);
          const reversed = records.some((item) => item.correctionOfId === record.id);
          const variance = record.kind === "settlement" && !reversed && linkedPlan && linkedPlan.baseCurrency === record.settlementCurrency &&
            linkedPlan.direction === "Outflow" && linkedPlan.originalAmountMinor === record.originalAmountMinor
            ? actual - BigInt(linkedPlan.forecastCostMinor) : null;
          return <tr key={record.id} className="border-b border-slate-100 last:border-0"><td className="py-3 text-slate-500">{record.occurredOn}</td><td className="py-3"><p className="font-medium">{record.kind === "reversal" ? "Reversal · " : ""}{record.description}</p><p className="text-xs text-slate-500">{record.kind === "reversal" ? `Linked to ${record.correctionOfId}` : linkedPlan ? `Plan: ${linkedPlan.title}` : "Unmatched"}{record.observedFxRate ? ` · Bank FX: ${record.observedFxRate}` : ""}{variance !== null ? ` · Variance: ${formatMinor(variance, record.settlementCurrency)}` : ""}</p></td><td className="py-3">{formatMinor(BigInt(record.originalAmountMinor), record.originalCurrency)}</td><td className="py-3 text-right">{formatMinor(BigInt(record.settlementAmountMinor), record.settlementCurrency)}</td><td className="py-3 text-right">{formatMinor(BigInt(record.explicitFeeMinor), record.settlementCurrency)}</td><td className="py-3 text-right font-medium">{formatMinor(cashEffectMinor(record), record.settlementCurrency)}</td><td className="py-3 text-right">{record.kind === "reversal" ? "Correction" : reversed ? "Reversed" : reverseConfirmId === record.id ? <span className="inline-flex gap-2"><button type="button" onClick={() => reverseRecord(record)} className="text-red-700 underline">Confirm reversal</button><button type="button" onClick={() => setReverseConfirmId(null)} className="text-slate-500 underline">Cancel</button></span> : <button type="button" onClick={() => setReverseConfirmId(record.id)} className="text-slate-700 underline">Reverse</button>}</td></tr>;
        })}</tbody></table>}
    </div>
  </section>;
}
