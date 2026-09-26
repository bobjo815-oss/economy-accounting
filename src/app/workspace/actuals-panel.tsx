"use client";

import { useMemo, useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatMinor, parseAmountToMinor, parseRate, safeMinorNumber, supportedCurrencies, type CurrencyCode } from "@/lib/finance/money";
import { normalizeDescription, suggestCategory } from "@/lib/finance/suggestion";
import type { ActualRow, CashDirection, EntryKind, WorkspaceData } from "@/lib/finance/records";

const kinds: { value: EntryKind; label: string; direction: CashDirection }[] = [
  { value: "expense", label: "Expense", direction: "outflow" },
  { value: "income", label: "Income", direction: "inflow" },
  { value: "loan_drawdown", label: "Loan drawdown", direction: "inflow" },
  { value: "loan_principal", label: "Loan principal", direction: "outflow" },
  { value: "loan_interest", label: "Loan interest", direction: "outflow" },
];

function cashEffect(actual: ActualRow) {
  const amount = BigInt(actual.settlement_amount_minor);
  const fee = BigInt(actual.explicit_fee_minor);
  const effect = actual.direction === "inflow" ? amount - fee : -(amount + fee);
  return actual.is_reversal ? -effect : effect;
}

export default function ActualsPanel({ data, userId, supabase, refresh }: {
  data: WorkspaceData; userId: string; supabase: SupabaseClient; refresh: () => Promise<void>;
}) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<EntryKind>("expense");
  const [originalAmount, setOriginalAmount] = useState("");
  const [originalCurrency, setOriginalCurrency] = useState<CurrencyCode>("GBP");
  const [accountId, setAccountId] = useState("");
  const [settledAmount, setSettledAmount] = useState("");
  const [feeTreatment, setFeeTreatment] = useState<"included" | "separate">("included");
  const [separateFee, setSeparateFee] = useState("");
  const [bankRate, setBankRate] = useState("");
  const [planId, setPlanId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [splitMode, setSplitMode] = useState(false);
  const [splitRows, setSplitRows] = useState([{ categoryId: "", amount: "" }, { categoryId: "", amount: "" }]);
  const [rememberRule, setRememberRule] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [reverseConfirmId, setReverseConfirmId] = useState<string | null>(null);

  const selectedKind = kinds.find((item) => item.value === kind)!;
  const selectedAccount = data.accounts.find((account) => account.id === accountId);
  const selectedPlan = data.plans.find((plan) => plan.id === planId);
  const suggestion = useMemo(() => suggestCategory(description, selectedKind.direction, data.merchantRules, data.actuals, data.recurringTemplates),
    [description, selectedKind.direction, data.merchantRules, data.actuals, data.recurringTemplates]);
  const suggestedLabel = data.categories.find((category) => category.id === suggestion?.categoryId)?.name;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedAccount) { setMessage("Select the account on the statement."); return; }
    const original = parseAmountToMinor(originalAmount, originalCurrency);
    const settled = parseAmountToMinor(settledAmount, selectedAccount.currency_code);
    const fee = parseAmountToMinor(feeTreatment === "separate" ? separateFee || "0" : "0", selectedAccount.currency_code);
    if (!description.trim() || !date || !original || !settled || original <= BigInt(0) || settled <= BigInt(0) || fee === null ||
      safeMinorNumber(original) === null || safeMinorNumber(settled) === null || safeMinorNumber(fee) === null ||
      (selectedKind.direction === "inflow" && fee > settled)) {
      setMessage("Check the description, date, original amount, final account amount, and separate fee."); return;
    }
    if (selectedPlan && (selectedPlan.direction !== selectedKind.direction || selectedPlan.currency_code !== originalCurrency ||
      selectedPlan.base_currency !== selectedAccount.currency_code)) {
      setMessage("A linked plan must match the direction, original currency, and account currency."); return;
    }
    if (bankRate.trim() && (originalCurrency === selectedAccount.currency_code || !parseRate(bankRate))) {
      setMessage("Enter a valid bank rate for a foreign-currency settlement."); return;
    }
    const parsedSplits = splitMode ? splitRows.map((row) => ({ category_id: row.categoryId, original_amount_minor: parseAmountToMinor(row.amount, originalCurrency) })) : [];
    if (splitMode && (parsedSplits.length < 2 || parsedSplits.some((row) => !row.category_id || row.original_amount_minor === null || row.original_amount_minor <= BigInt(0)) ||
      parsedSplits.reduce((sum, row) => sum + (row.original_amount_minor ?? BigInt(0)), BigInt(0)) !== original)) {
      setMessage("Split amounts must be positive and add up exactly to the original amount."); return;
    }
    setPending(true);
    try {
      let snapshotId: string | null = null;
      if (bankRate.trim()) {
        const snapshot = await supabase.from("fx_snapshots").insert({
          user_id: userId, from_currency: originalCurrency, to_currency: selectedAccount.currency_code,
          rate: bankRate.trim(), observed_on: date, purpose: "actual_settlement", source_label: "Bank statement (manual)",
        }).select("id").single();
        if (snapshot.error || !snapshot.data) throw new Error("Rate could not be saved.");
        snapshotId = snapshot.data.id as string;
      }
      const result = await supabase.rpc("create_settled_actual", { p_actual: {
        plan_id: planId || null, account_id: accountId, category_id: splitMode ? null : categoryId || null,
        occurred_on: date, description: description.trim(), direction: selectedKind.direction, entry_kind: kind,
        original_amount_minor: Number(original), currency_code: originalCurrency,
        settlement_amount_minor: Number(settled), settlement_currency: selectedAccount.currency_code,
        explicit_fee_minor: Number(fee), settlement_fx_snapshot_id: snapshotId,
      }, p_splits: parsedSplits.map((row) => ({ category_id: row.category_id, original_amount_minor: Number(row.original_amount_minor) })) });
      if (result.error || !result.data) throw new Error("Settlement could not be saved.");
      let ruleFailed = false;
      if (rememberRule && categoryId && description.trim()) {
        const pattern = normalizeDescription(description);
        const event = await supabase.from("merchant_rule_events").insert({
          user_id: userId, normalized_pattern: pattern, category_id: categoryId,
          actual_transaction_id: result.data,
        });
        const rule = event.error ? null : await supabase.from("merchant_rules").upsert({
          user_id: userId, normalized_pattern: pattern, category_id: categoryId,
        }, { onConflict: "user_id,normalized_pattern" });
        ruleFailed = Boolean(event.error || rule?.error);
      }
      setDescription(""); setOriginalAmount(""); setSettledAmount(""); setSeparateFee(""); setBankRate(""); setPlanId("");
      setSplitMode(false); setSplitRows([{ categoryId: "", amount: "" }, { categoryId: "", amount: "" }]);
      setRememberRule(false);
      setMessage(ruleFailed ? "Settlement saved. The category rule could not be remembered." : "Settlement saved. Original and final account amounts remain separate.");
      await refresh();
    } catch { setMessage("Settlement could not be saved. Check the selected account, plan, and database setup."); }
    finally { setPending(false); }
  }

  async function reverse(actual: ActualRow) {
    if (actual.is_reversal || data.actuals.some((item) => item.correction_of_id === actual.id)) return;
    setPending(true);
    const { error } = await supabase.rpc("reverse_actual", { p_original_id: actual.id });
    setPending(false); setReverseConfirmId(null);
    setMessage(error ? "Reversal could not be saved." : "Linked reversal saved. Add a new settlement to replace the original.");
    if (!error) await refresh();
  }

  return <section id="actuals" className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
    <h2 className="text-lg font-semibold">Actual settlements</h2>
    <p className="mt-1 text-sm text-slate-500">Enter the original charge and the final amount on your account statement. A fee already included in that final amount is not added again.</p>
    <form onSubmit={submit} className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="text-sm lg:col-span-2">Description<input required maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
      <label className="text-sm">Settlement date<input required type="date" value={date} onChange={(event) => setDate(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
      <label className="text-sm">Type<select value={kind} onChange={(event) => setKind(event.target.value as EntryKind)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2">{kinds.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      <label className="text-sm">Original amount<input required inputMode="decimal" value={originalAmount} onChange={(event) => setOriginalAmount(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
      <label className="text-sm">Original currency<select value={originalCurrency} onChange={(event) => setOriginalCurrency(event.target.value as CurrencyCode)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2">{supportedCurrencies.map((code) => <option key={code}>{code}</option>)}</select></label>
      <label className="text-sm">Account<select required value={accountId} onChange={(event) => setAccountId(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="">Choose account</option>{data.accounts.filter((account) => account.is_active).map((account) => <option key={account.id} value={account.id}>{account.name} ({account.currency_code})</option>)}</select></label>
      <label className="text-sm">Final account amount {selectedAccount ? `(${selectedAccount.currency_code})` : ""}<input required inputMode="decimal" value={settledAmount} onChange={(event) => setSettledAmount(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
      <label className="text-sm">Fee treatment<select value={feeTreatment} onChange={(event) => setFeeTreatment(event.target.value as "included" | "separate")} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="included">Included in final amount / none</option><option value="separate">Charged separately</option></select></label>
      {feeTreatment === "separate" && <label className="text-sm">Separate fee {selectedAccount ? `(${selectedAccount.currency_code})` : ""}<input inputMode="decimal" value={separateFee} onChange={(event) => setSeparateFee(event.target.value)} placeholder="0" className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label>}
      {selectedAccount && selectedAccount.currency_code !== originalCurrency && <label className="text-sm">Bank FX rate, if known<input inputMode="decimal" value={bankRate} onChange={(event) => setBankRate(event.target.value)} placeholder={`1 ${originalCurrency} in ${selectedAccount.currency_code}`} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label>}
      <label className="text-sm">Link to plan<select value={planId} onChange={(event) => setPlanId(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="">Unmatched</option>{data.plans.filter((plan) => plan.status !== "canceled").map((plan) => <option key={plan.id} value={plan.id}>{plan.scheduled_date} · {plan.title}</option>)}</select></label>
      <label className="text-sm">Category<select disabled={splitMode} value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 disabled:opacity-50"><option value="">Uncategorized</option>{data.categories.filter((category) => category.is_active && category.normal_direction === selectedKind.direction).map((category) => <option key={category.id} value={category.id}>{category.major_name} / {category.name}</option>)}</select></label>
      <div className="text-sm lg:col-span-2">{!splitMode && suggestion && suggestedLabel ? <p>Suggestion from {suggestion.source}: <strong>{suggestedLabel}</strong> <button type="button" onClick={() => setCategoryId(suggestion.categoryId)} className="ml-2 underline">Use category</button></p> : <p className="text-slate-500">{splitMode ? "Assign each split below." : "No category suggestion. Choose one if known."}</p>}<label className="mt-2 inline-flex items-center gap-2"><input type="checkbox" checked={rememberRule} disabled={splitMode} onChange={(event) => setRememberRule(event.target.checked)} />Remember my chosen category for this exact description</label></div>
      <div className="lg:col-span-4"><label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={splitMode} onChange={(event) => { setSplitMode(event.target.checked); if (event.target.checked) { setCategoryId(""); setRememberRule(false); } }} />Split this purchase across categories</label>{splitMode && <div className="mt-3 grid gap-2">{splitRows.map((row, index) => <div key={index} className="flex flex-wrap gap-2"><select aria-label={`Split ${index + 1} category`} value={row.categoryId} onChange={(event) => setSplitRows((current) => current.map((item, at) => at === index ? { ...item, categoryId: event.target.value } : item))} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="">Choose category</option>{data.categories.filter((category) => category.is_active && category.normal_direction === selectedKind.direction).map((category) => <option key={category.id} value={category.id}>{category.major_name} / {category.name}</option>)}</select><input aria-label={`Split ${index + 1} original amount`} inputMode="decimal" value={row.amount} onChange={(event) => setSplitRows((current) => current.map((item, at) => at === index ? { ...item, amount: event.target.value } : item))} placeholder={`Amount in ${originalCurrency}`} className="w-40 rounded-lg border border-slate-300 px-3 py-2 text-sm" />{splitRows.length > 2 && <button type="button" onClick={() => setSplitRows((current) => current.filter((_, at) => at !== index))} className="text-sm underline">Remove</button>}</div>)}<button type="button" onClick={() => setSplitRows((current) => [...current, { categoryId: "", amount: "" }])} className="justify-self-start text-sm underline">Add split</button></div>}</div>
      <div className="flex items-end"><button disabled={pending} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Record settlement</button></div>
    </form>
    {message && <p role="status" className="mt-3 text-sm text-slate-600">{message}</p>}
    <div className="mt-6 overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase text-slate-500"><tr><th className="pb-2">Date</th><th className="pb-2">Description</th><th className="pb-2">Original</th><th className="pb-2 text-right">Final account amount</th><th className="pb-2 text-right">Separate fee</th><th className="pb-2 text-right">Cash effect</th><th className="pb-2 text-right">Correction</th></tr></thead><tbody>{data.actuals.map((actual) => { const reversed = data.actuals.some((item) => item.correction_of_id === actual.id); const splits = data.splits.filter((split) => split.actual_transaction_id === actual.id); return <tr key={actual.id} className="border-b border-slate-100"><td className="py-3">{actual.occurred_on}</td><td className="py-3"><p>{actual.is_reversal ? "Reversal · " : ""}{actual.description}</p>{actual.plan_id && <p className="text-xs text-slate-500">Plan: {data.plans.find((plan) => plan.id === actual.plan_id)?.title ?? "Unavailable"}</p>}{splits.length > 0 && <p className="text-xs text-slate-500">Split: {splits.map((split) => `${data.categories.find((category) => category.id === split.category_id)?.name ?? "Unknown"} ${formatMinor(BigInt(split.original_amount_minor), actual.currency_code)}`).join(" · ")}</p>}</td><td className="py-3">{formatMinor(BigInt(actual.original_amount_minor), actual.currency_code)}</td><td className="py-3 text-right">{formatMinor(BigInt(actual.settlement_amount_minor), actual.settlement_currency)}</td><td className="py-3 text-right">{formatMinor(BigInt(actual.explicit_fee_minor), actual.settlement_currency)}</td><td className="py-3 text-right">{formatMinor(cashEffect(actual), actual.settlement_currency)}</td><td className="py-3 text-right">{actual.is_reversal ? "Linked reversal" : reversed ? "Reversed" : reverseConfirmId === actual.id ? <span className="inline-flex gap-2"><button type="button" disabled={pending} onClick={() => reverse(actual)} className="text-red-700 underline">Confirm</button><button type="button" onClick={() => setReverseConfirmId(null)} className="underline">Cancel</button></span> : <button type="button" onClick={() => setReverseConfirmId(actual.id)} className="underline">Reverse</button>}</td></tr>; })}</tbody></table>{data.actuals.length === 0 && <p className="py-5 text-sm text-slate-500">No settlements yet.</p>}</div>
  </section>;
}
