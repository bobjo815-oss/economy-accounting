"use client";
import { localDate } from "@/lib/finance/local-date";
import { useLanguage } from "@/lib/i18n/provider";

import { Fragment, useMemo, useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decimalAmountFromMinor, formatMinor, parseAmountToMinor, parseRate, safeMinorNumber, type CurrencyCode } from "@/lib/finance/money";
import { normalizeDescription, suggestCategory } from "@/lib/finance/suggestion";
import type { ActualRow, CashDirection, EntryKind, WorkspaceData } from "@/lib/finance/records";
import ReceiptImporter from "./receipt-importer";
import StatementImporter from "./statement-importer";
import type { TransactionDraft } from "@/lib/finance/transaction-drafts";
import { effectiveKrwRate } from "@/lib/finance/statement-settlement";
import ActualInlineEditor from "./actual-inline-editor";
import SortControl from "./sort-control";
import { CurrencySelect } from "./currency-select";

const kinds: { value: EntryKind; label: string; direction: CashDirection }[] = [
  { value: "income", label: "Income", direction: "inflow" },
  { value: "expense", label: "Expense", direction: "outflow" },
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

export default function ActualsPanel({ data, userId, supabase, refresh, draft, compact = false, sortOrder = "date-desc", onSortChange, reviewRecordId }: {
  reviewRecordId?: string; data: WorkspaceData; userId: string; supabase: SupabaseClient; refresh: () => Promise<void>; draft?: TransactionDraft; compact?: boolean; sortOrder?: string; onSortChange?: (value: string) => void;
}) {
  const { t, locale } = useLanguage();
  const [date, setDate] = useState(() => draft?.occurred_on ?? localDate(data.profile?.timezone));
  const [description, setDescription] = useState(draft?.description ?? "");
  const [kind, setKind] = useState<EntryKind>(draft?.direction === "inflow" ? "income" : "expense");
  const [originalAmount, setOriginalAmount] = useState(draft ? decimalAmountFromMinor(draft.original_amount_minor, draft.currency_code) : "");
  const [originalCurrency, setOriginalCurrency] = useState<CurrencyCode>(draft?.currency_code ?? "GBP");
  const [accountId, setAccountId] = useState(draft?.account_id ?? "");
  const [settledAmount, setSettledAmount] = useState(draft?.confirmed_debit_krw ? String(draft.confirmed_debit_krw) : "");
  const [feeTreatment, setFeeTreatment] = useState<"included" | "separate">("included");
  const [separateFee, setSeparateFee] = useState("");
  const [bankRate, setBankRate] = useState(draft?.confirmed_debit_krw && draft.currency_code !== "KRW" ? effectiveKrwRate(draft.original_amount_minor,draft.currency_code,draft.confirmed_debit_krw) ?? "" : "");
  const [planId, setPlanId] = useState("");
  const [categoryId, setCategoryId] = useState(draft?.category_id ?? "");
  const [splitMode, setSplitMode] = useState(false);
  const [splitRows, setSplitRows] = useState([{ categoryId: "", amount: "" }, { categoryId: "", amount: "" }]);
  const [rememberRule, setRememberRule] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [reverseConfirmId, setReverseConfirmId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [importSaveCallback, setImportSaveCallback] = useState<(() => void) | null>(null);
  const [importCancelCallback, setImportCancelCallback] = useState<(() => void) | null>(null);
  const [activeImport, setActiveImport] = useState<"receipt" | "statement" | null>(null);

  const selectedKind = kinds.find((item) => item.value === kind)!;
  const selectedAccount = data.accounts.find((account) => account.id === accountId);
  const selectedPlan = data.plans.find((plan) => plan.id === planId);
  const suggestion = useMemo(() => suggestCategory(description, selectedKind.direction, data.merchantRules, data.actuals, data.recurringTemplates),
    [description, selectedKind.direction, data.merchantRules, data.actuals, data.recurringTemplates]);
  const suggestedLabel = data.categories.find((category) => category.id === suggestion?.categoryId)?.name;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedAccount) { setMessage("Select the account on the statement."); return; }
    if (draft?.confirmed_debit_krw && selectedAccount.currency_code !== "KRW") { setMessage(locale === "ko" ? "확인된 명세서 출금액은 KRW입니다. 원화 결제 계좌를 선택하세요." : "The confirmed statement debit is KRW. Select a KRW payment account."); return; }
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
      const result = await supabase.rpc(draft ? "settle_transaction_draft" : "create_settled_actual", { ...(draft ? { p_draft_id: draft.id } : {}), p_actual: {
        plan_id: planId || null, account_id: accountId, category_id: splitMode ? null : categoryId || null,
        occurred_on: date, description: description.trim(), direction: selectedKind.direction, entry_kind: kind,
        original_amount_minor: Number(original), currency_code: originalCurrency,
        settlement_amount_minor: Number(settled), settlement_currency: selectedAccount.currency_code,
        explicit_fee_minor: Number(fee), settlement_fx_snapshot_id: snapshotId,
      }, p_splits: parsedSplits.map((row) => ({ category_id: row.category_id, original_amount_minor: Number(row.original_amount_minor) })) });
      if (result.error || !result.data) throw new Error("Settlement could not be saved.");
      importSaveCallback?.();
      setImportSaveCallback(null);
      setImportCancelCallback(null);
      setActiveImport(null);
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

  function discardImportedDraft() {
    importCancelCallback?.();
    setImportSaveCallback(null);
    setImportCancelCallback(null);
    setActiveImport(null);
    setDescription(""); setDate(localDate(data.profile?.timezone)); setOriginalAmount(""); setSettledAmount("");
    setSeparateFee(""); setBankRate(""); setPlanId(""); setCategoryId(""); setAccountId("");
    setSplitMode(false); setSplitRows([{ categoryId: "", amount: "" }, { categoryId: "", amount: "" }]);
    setRememberRule(false); setMessage("");
  }

  return <section id="actuals" className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
    <h2 className="text-lg font-semibold">{compact ? (locale === "ko" ? "거래 확정" : "Confirm transaction") : t("Actual settlements")}</h2>
    <p className="mt-1 text-sm text-slate-500">{t("Enter the original charge and the final amount on your account statement. A fee already included in that final amount is not added again.")}</p>
    {!reviewRecordId && <form onSubmit={submit} className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {!compact && <ReceiptImporter blocked={Boolean(draft) || activeImport !== null} onApply={(draft, onSaved, onCancelled) => {
        if (draft.merchant) setDescription(draft.merchant);
        if (draft.date) setDate(draft.date);
        if (draft.total && draft.currency) setOriginalAmount(draft.total);
        if (draft.currency) setOriginalCurrency(draft.currency);
        setImportSaveCallback(() => onSaved);
        setImportCancelCallback(() => onCancelled);
        setActiveImport("receipt");
      }} />}
      {!compact && <StatementImporter accounts={data.accounts} actuals={data.actuals} blocked={Boolean(draft) || activeImport !== null} onApply={(entry, selectedAccountId, onSaved, onCancelled) => {
        if ((description.trim() || originalAmount || settledAmount) && !window.confirm(locale === "ko" ? "현재 입력 중인 내용이 바뀝니다. 명세서 거래를 입력란에 적용할까요?" : "This will replace the transaction currently in the form. Use this statement row?")) return false;
        const amount = formatMinor(entry.amountMinor, entry.currency).split(" ")[0].replace(/,/g, "");
        setDate(entry.date);
        setDescription(entry.description);
        setKind(entry.direction === "outflow" ? "expense" : "income");
        setOriginalAmount(amount);
        setOriginalCurrency(entry.currency);
        setAccountId(selectedAccountId);
        setSettledAmount(amount);
        setFeeTreatment("included");
        setSeparateFee("");
        setBankRate("");
        setPlanId("");
        setCategoryId("");
        setSplitMode(false);
        setSplitRows([{ categoryId: "", amount: "" }, { categoryId: "", amount: "" }]);
        setRememberRule(false);
        setImportSaveCallback(() => onSaved);
        setImportCancelCallback(() => onCancelled);
        setActiveImport("statement");
        return true;
      }} />}
      <label className="text-sm lg:col-span-2">{t("Description")}<input required maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
      <label className="text-sm">{t("Settlement date")}<input required type="date" value={date} onChange={(event) => setDate(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
      <label className="text-sm">{t("Type")}<select value={kind} onChange={(event) => setKind(event.target.value as EntryKind)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2">{kinds.map((item) => <option key={item.value} value={item.value}>{t(item.label)}</option>)}</select></label>
      <label className="text-sm">{t("Original amount")}<input required inputMode="decimal" value={originalAmount} onChange={(event) => setOriginalAmount(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
      <label className="text-sm">{t("Original currency")}<CurrencySelect value={originalCurrency} onChange={(code) => { setOriginalCurrency(code); setBankRate(""); }} locale={locale} className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2" /></label>
      <label className="text-sm">{t("Account")}<select required value={accountId} onChange={(event) => { setAccountId(event.target.value); setBankRate(""); }} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="">{t("Choose account")}</option>{data.accounts.filter((account) => account.is_active).map((account) => <option key={account.id} value={account.id}>{account.name} ({account.currency_code})</option>)}</select></label>
      <label className="text-sm">{t("Final account amount")}{" "}{selectedAccount ? `(${selectedAccount.currency_code})` : ""}<input required inputMode="decimal" value={settledAmount} onChange={(event) => setSettledAmount(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
      <label className="text-sm">{t("Fee treatment")}<select value={feeTreatment} onChange={(event) => setFeeTreatment(event.target.value as "included" | "separate")} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="included">{t("Included in final amount / none")}</option><option value="separate">{t("Charged separately")}</option></select></label>
      {feeTreatment === "separate" && <label className="text-sm">{t("Separate fee")}{" "}{selectedAccount ? `(${selectedAccount.currency_code})` : ""}<input inputMode="decimal" value={separateFee} onChange={(event) => setSeparateFee(event.target.value)} placeholder="0" className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label>}
      {selectedAccount && selectedAccount.currency_code !== originalCurrency && <label className="text-sm">{t("Bank FX rate, if known")}<input inputMode="decimal" value={bankRate} onChange={(event) => setBankRate(event.target.value)} placeholder={`1 ${originalCurrency} → ${selectedAccount.currency_code}`} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label>}
      <label className="text-sm">{t("Link to plan")}<select value={planId} onChange={(event) => setPlanId(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="">{t("Unmatched")}</option>{data.plans.filter((plan) => plan.status !== t("canceled")).map((plan) => <option key={plan.id} value={plan.id}>{plan.scheduled_date} · {plan.title}</option>)}</select></label>
      <label className="text-sm">{t("Category")}<select disabled={splitMode} value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 disabled:opacity-50"><option value="">{t("Uncategorized")}</option>{data.categories.filter((category) => category.is_active && category.normal_direction === selectedKind.direction).map((category) => <option key={category.id} value={category.id}>{category.major_name} / {category.name}</option>)}</select></label>
      <div className="text-sm lg:col-span-2">{!splitMode && suggestion && suggestedLabel ? <p>{t("Suggestion from")}{" "}{t(suggestion.source)}: <strong>{suggestedLabel}</strong> <button type="button" onClick={() => setCategoryId(suggestion.categoryId)} className="ml-2 underline">{t("Use category")}</button></p> : <p className="text-slate-500">{splitMode ? t("Assign each split below.") : t("No category suggestion. Choose one if known.")}</p>}<label className="mt-2 inline-flex items-center gap-2"><input type="checkbox" checked={rememberRule} disabled={splitMode} onChange={(event) => setRememberRule(event.target.checked)} />{t("Remember my chosen category for this exact description")}</label></div>
      <div className="lg:col-span-4"><label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={splitMode} onChange={(event) => { setSplitMode(event.target.checked); if (event.target.checked) { setCategoryId(""); setRememberRule(false); } }} />{t("Split this purchase across categories")}</label>{splitMode && <div className="mt-3 grid gap-2">{splitRows.map((row, index) => <div key={index} className="flex flex-wrap gap-2"><select aria-label={`${t("Category")} ${index + 1}`} value={row.categoryId} onChange={(event) => setSplitRows((current) => current.map((item, at) => at === index ? { ...item, categoryId: event.target.value } : item))} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="">{t("Choose category")}</option>{data.categories.filter((category) => category.is_active && category.normal_direction === selectedKind.direction).map((category) => <option key={category.id} value={category.id}>{category.major_name} / {category.name}</option>)}</select><input aria-label={`${t("Original amount")} ${index + 1}`} inputMode="decimal" value={row.amount} onChange={(event) => setSplitRows((current) => current.map((item, at) => at === index ? { ...item, amount: event.target.value } : item))} placeholder={`${t("Amount")} (${originalCurrency})`} className="w-40 rounded-lg border border-slate-300 px-3 py-2 text-sm" />{splitRows.length > 2 && <button type="button" onClick={() => setSplitRows((current) => current.filter((_, at) => at !== index))} className="text-sm underline">{t("Remove")}</button>}</div>)}<button type="button" onClick={() => setSplitRows((current) => [...current, { categoryId: "", amount: "" }])} className="justify-self-start text-sm underline">{t("Add split")}</button></div>}</div>
      <div className="flex flex-wrap items-end gap-2"><button disabled={pending} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{t("Record settlement")}</button>{activeImport && <button type="button" disabled={pending} onClick={discardImportedDraft} className="rounded-lg border border-slate-300 px-4 py-2 text-sm disabled:opacity-50">{locale === "ko" ? "가져온 초안 취소" : "Discard imported draft"}</button>}</div>
    </form>}
    {message && <p role="status" className="mt-3 text-sm text-slate-600">{t(message)}</p>}
    {!compact && <div className="mt-5 flex justify-end"><SortControl label={locale === "ko" ? "정렬" : "Sort"} value={sortOrder} onChange={onSortChange ?? (() => {})} options={[
      { value: "date-desc", label: locale === "ko" ? "날짜 · 최신순" : "Date · newest first" },
      { value: "date-asc", label: locale === "ko" ? "날짜 · 오래된 순" : "Date · oldest first" },
      { value: "description", label: locale === "ko" ? "내용 · ㄱ-ㅎ / A-Z" : "Description · A-Z" },
      { value: "amount-asc", label: locale === "ko" ? "계좌 반영액 · 통화별 낮은 순" : "Account amount · low within currency" },
      { value: "amount-desc", label: locale === "ko" ? "계좌 반영액 · 통화별 높은 순" : "Account amount · high within currency" },
      { value: "type", label: locale === "ko" ? "유형 · ㄱ-ㅎ" : "Type · A-Z" },
    ]} /></div>}
    {!compact && <><div className="mt-6 flex flex-wrap gap-4"><label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={showHistory} onChange={e => setShowHistory(e.target.checked)} />{locale === "ko" ? "수정 이력 포함" : "Include correction history"}</label><button type="button" onClick={() => void refresh()} className="rounded border px-3 py-2 text-sm">{locale === "ko" ? "거래 목록 새로고침" : "Reload transactions"}</button></div><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase text-slate-500"><tr><th className="pb-2">{t("Date")}</th><th className="pb-2">{t("Description")}</th><th className="pb-2">{t("Original")}</th><th className="pb-2 text-right">{t("Final account amount")}{" "}</th><th className="pb-2 text-right">{t("Separate fee")}{" "}</th><th className="pb-2 text-right">{t("Cash effect")}</th><th className="pb-2 text-right">{t("Correction")}</th></tr></thead><tbody>{data.actuals.filter(a => (!reviewRecordId || a.id === reviewRecordId) && (showHistory || (!a.is_reversal && !data.actuals.some(r => r.correction_of_id === a.id)))).map((actual) => { const reversed = data.actuals.some((item) => item.correction_of_id === actual.id); const splits = data.splits.filter((split) => split.actual_transaction_id === actual.id); return <Fragment key={actual.id}><tr className={`border-b border-slate-100 ${reviewRecordId ? "bg-amber-50 ring-2 ring-inset ring-amber-400" : ""}`}><td className="py-3">{actual.occurred_on}</td><td className="py-3"><p>{actual.is_reversal ? t("Reversal · ") : ""}{actual.description}</p>{data.actualEditProposals?.some(p => p.original_actual_id === actual.id) && <p className="mt-1 font-medium text-red-700">{locale === "ko" ? "검토 필요 · 저장된 수정안 있음" : "Needs review · saved changes"}</p>}{actual.plan_id && <p className="text-xs text-slate-500">{t("Plan:")}{" "}{data.plans.find((plan) => plan.id === actual.plan_id)?.title ?? t("Unavailable")}</p>}{splits.length > 0 && <p className="text-xs text-slate-500">{t("Split:")}{" "}{splits.map((split) => `${data.categories.find((category) => category.id === split.category_id)?.name ?? t("Unknown")} ${formatMinor(BigInt(split.original_amount_minor), actual.currency_code)}`).join(" · ")}</p>}</td><td className="py-3">{formatMinor(BigInt(actual.original_amount_minor), actual.currency_code)}</td><td className="py-3 text-right">{formatMinor(BigInt(actual.settlement_amount_minor), actual.settlement_currency)}</td><td className="py-3 text-right">{formatMinor(BigInt(actual.explicit_fee_minor), actual.settlement_currency)}</td><td className="py-3 text-right">{formatMinor(cashEffect(actual), actual.settlement_currency)}</td><td className="py-3 text-right">{actual.is_reversal ? t("Linked reversal") : reversed ? t("Reversed") : reverseConfirmId === actual.id ? <span className="inline-flex gap-2"><button type="button" disabled={pending} onClick={() => reverse(actual)} className="text-red-700 underline">{t("Confirm")}</button><button type="button" onClick={() => setReverseConfirmId(null)} className="underline">{t("Cancel")}</button></span> : <span className="inline-flex gap-3"><button type="button" disabled={pending || editingId !== null} onClick={() => setEditingId(actual.id)} className="rounded border border-teal-700 px-3 py-1 text-teal-800 disabled:opacity-50">{locale === "ko" ? "바로 수정" : "Edit inline"}</button><button type="button" disabled={pending || editingId !== null} onClick={() => setReverseConfirmId(actual.id)} className="underline">{t("Reverse")}</button></span>}</td></tr>{editingId === actual.id && <tr><td colSpan={7}><ActualInlineEditor actual={actual} data={data} supabase={supabase} onCancel={() => setEditingId(null)} onSaved={async () => { setEditingId(null); await refresh(); }} /></td></tr>}</Fragment>; })}</tbody></table>{data.actuals.length === 0 && <p className="py-5 text-sm text-slate-500">{t("No settlements yet.")}</p>}</div></>}
  </section>;
}
