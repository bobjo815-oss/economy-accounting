"use client";
import { Fragment, useCallback, useEffect, useState, startTransition, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import Link from "next/link";
import { useLanguage } from "@/lib/i18n/provider";
import { decimalAmountFromMinor, formatMinor, type CurrencyCode } from "@/lib/finance/money";
import { localDate } from "@/lib/finance/local-date";
import { draftFields, statementCandidates, visibleDrafts, type TransactionDraft, type StatementEvidence } from "@/lib/finance/transaction-drafts";
import type { WorkspaceData } from "@/lib/finance/records";
import { allocateReceiptItems, type DebitConfirmation } from "@/lib/finance/statement-settlement";
import ReceiptDebitBreakdown from "./receipt-debit-breakdown";
import ActualsPanel from "./actuals-panel";
import ActualInlineEditor from "./actual-inline-editor";
import SortControl from "./sort-control";
import { compareBigInt, compareText, sortRows } from "@/lib/finance/sorting";
import { CurrencySelect } from "./currency-select";

const decimal = (amount: number, currency: CurrencyCode) => decimalAmountFromMinor(amount, currency);
const blank = () => ({ date: "", description: "", amount: "", currency: "GBP", direction: "outflow", paymentMethod: "", referenceKrw: "", notes: "", accountId: "", categoryId: "", statementId: "" });
type Props = { supabase: SupabaseClient; userId: string; data: WorkspaceData; blocked: boolean; revision?: number; refresh: () => Promise<void> };
export default function TransactionDraftsPanel({ supabase, userId, data, blocked, revision = 0, refresh }: Props) {
  const { locale } = useLanguage();
  const text = (ko: string, en: string) => locale === "ko" ? ko : en;
  const [drafts, setDrafts] = useState<TransactionDraft[]>([]);
  const [statements, setStatements] = useState<StatementEvidence[]>([]);
  const [confirmations, setConfirmations] = useState<DebitConfirmation[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [editing, setEditing] = useState<TransactionDraft | null>(null);
  const [confirming, setConfirming] = useState<TransactionDraft | null>(null);
  const [creating, setCreating] = useState(false);
  const [sourceStatement, setSourceStatement] = useState<StatementEvidence | null>(null);
  const [fields, setFields] = useState(blank);
  const [showStatements, setShowStatements] = useState(false);
  const [filter, setFilter] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [draftSort, setDraftSort] = useState("date-desc");
  const [history, setHistory] = useState<{ id: string; created_at: string }[]>([]);
  const load = useCallback(async () => {
    setReloading(true);
    try {
    const [d, s, c] = await Promise.all([
      supabase.from("transaction_drafts").select("*").eq("user_id", userId).order("occurred_on", { ascending: false }),
      supabase.from("statement_evidence").select("*").eq("user_id", userId).order("occurred_on", { ascending: false }),
      supabase.from("statement_debit_confirmations").select("statement_evidence_id,amount_krw_minor").eq("user_id", userId),
    ]);
    if (d.error || s.error || c.error) { setMessage("불러오기 실패 / Could not load drafts. Please retry."); return; }
    setConfirmations(c.data as DebitConfirmation[]);
    setDrafts(d.data as TransactionDraft[]); setStatements(s.data as StatementEvidence[]); setLoaded(true);
    } catch {
      setMessage("불러오기 실패 / Could not load drafts. Please retry.");
    } finally {
      setReloading(false);
    }
  }, [supabase, userId]);
  useEffect(() => { startTransition(() => { void load(); }); }, [load, revision]);

  function open(draft: TransactionDraft) {
    setEditing(draft); setCreating(false); setSourceStatement(null); setHistory([]); setMessage("");
    setFields({ date: draft.occurred_on, description: draft.description, amount: decimal(draft.original_amount_minor, draft.currency_code), currency: draft.currency_code,
      direction: draft.direction, paymentMethod: draft.payment_method, referenceKrw: draft.reference_krw_minor === null ? "" : String(draft.reference_krw_minor), notes: draft.notes,
      accountId: draft.account_id ?? "", categoryId: draft.category_id ?? "", statementId: draft.statement_evidence_id ?? "" });
  }
  function create(statement?: StatementEvidence) {
    setEditing(null); setCreating(true); setSourceStatement(statement ?? null); setHistory([]); setMessage("");
    setFields({ ...blank(), date: statement?.occurred_on ?? localDate(data.profile?.timezone), description: statement?.description ?? "",
      amount: statement?.original_amount_minor != null && statement.currency_code ? decimal(statement.original_amount_minor, statement.currency_code) : "",
      currency: statement ? statement.currency_code ?? "" : "GBP", paymentMethod: statement?.payment_method ?? "",
      referenceKrw: statement?.reported_krw_minor == null ? "" : String(statement.reported_krw_minor), statementId: statement?.id ?? "" });
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    const parsed = draftFields(fields);
    if (!parsed) { setMessage(text("날짜·내용·금액·통화를 확인하세요.", "Check the date, description, amount and currency.")); return; }
    setBusy(true); setMessage("");
    const payload = { ...parsed, account_id: fields.accountId || null, category_id: fields.categoryId || null, statement_evidence_id: fields.statementId || null };
    const result = editing ? await supabase.from("transaction_drafts").update(payload).eq("id", editing.id).eq("user_id", userId).eq("updated_at", editing.updated_at).select("id") :
      await supabase.from("transaction_drafts").insert({ ...payload, user_id: userId, source_key: sourceStatement ? `statement:${sourceStatement.source_key}` : `manual:${crypto.randomUUID()}`,
        evidence: sourceStatement ? { statementSourceKey: sourceStatement.source_key, source: "User-selected statement row" } : { source: "Manual user entry" } }).select("id");
    setBusy(false);
    if (result.error || !result.data?.length) { setMessage(text("저장하지 못했습니다. 중복·다른 화면의 변경·명세서 연결을 확인하고 다시 불러오세요.", "Not saved. Check duplicates, concurrent changes or statement links, then reload.")); return; }
    setEditing(null); setCreating(false); setMessage(text("저장했습니다. 미확정 거래는 잔액에 반영되지 않습니다.", "Saved. Drafts do not affect balances.")); await load();
  }
  async function archive(draft: TransactionDraft) {
    if (!window.confirm(text("이 초안을 보관함으로 옮길까요? 삭제하거나 결제 기록을 바꾸지는 않습니다.", "Archive this draft? It will not delete or change a settlement."))) return;
    setBusy(true);
    const result = await supabase.from("transaction_drafts").update({ archived: !draft.archived }).eq("id", draft.id).eq("user_id", userId).eq("updated_at", draft.updated_at).select("id");
    setBusy(false); if (result.error || !result.data?.length) setMessage(text("변경하지 못했습니다. 다시 불러오세요.", "Could not change this draft. Reload.")); else await load();
  }
  const candidates = editing ? statementCandidates(editing, statements) : [];
  const choices = statements.filter(s => s.status === "confirmed" && (!drafts.some(d => d.statement_evidence_id === s.id && d.id !== editing?.id)));
  const frozen = Boolean(editing?.settled_actual_id);
  const active = sortRows(visibleDrafts(drafts, { showArchived, showCompleted, query: filter }), (a, b) => {
    if (draftSort === "date-asc") return compareText(a.occurred_on,b.occurred_on,locale);
    if (draftSort === "description") return compareText(a.description,b.description,locale);
    if (draftSort === "amount-asc" || draftSort === "amount-desc") return compareText(a.currency_code,b.currency_code,locale) || (draftSort === "amount-desc" ? -compareBigInt(BigInt(a.original_amount_minor),BigInt(b.original_amount_minor)) : compareBigInt(BigInt(a.original_amount_minor),BigInt(b.original_amount_minor)));
    if (draftSort === "status") return compareText(a.settled_actual_id ? "settled" : a.archived ? "archived" : "pending", b.settled_actual_id ? "settled" : b.archived ? "archived" : "pending", locale);
    return compareText(b.occurred_on,a.occurred_on,locale);
  });
  const change = (key: keyof ReturnType<typeof blank>, value: string) => setFields(f => ({ ...f, [key]: value }));
  const debitFor = (draft: TransactionDraft) => confirmations.find(c => c.statement_evidence_id === draft.statement_evidence_id)?.amount_krw_minor;
  const onApply = (draft: TransactionDraft) => setConfirming({ ...draft, confirmed_debit_krw: debitFor(draft) });
  const editingDebit = confirmations.find(c => c.statement_evidence_id === fields.statementId)?.amount_krw_minor;
  const allocations = editing && editingDebit && Array.isArray(editing.evidence.items) ? allocateReceiptItems(editing.evidence.items, editing.original_amount_minor, editing.currency_code, editingDebit) : null;
  return <section className="mb-6 rounded-2xl border border-teal-200 bg-teal-50/30 p-5" aria-label={text("보완 필요 거래", "Needs completion")}>
    <div className="flex flex-wrap justify-between gap-3"><div><h3 className="text-xl font-semibold">{text("보완 필요 거래", "Needs completion")}</h3><p className="mt-2 max-w-3xl text-sm text-slate-600">{text("저장되어 있지만 아직 수입·지출 내역에 반영되지 않은 기록입니다. 결제 계좌·카드와 최종 출금액을 확인해 반영하세요. 이미 확인된 금액은 다시 입력할 필요가 없습니다.", "These saved entries have not been posted to Transactions yet. Check the payment account/card and final debit before posting. Confirmed amounts do not need to be entered again.")}</p></div><button type="button" disabled={busy || blocked} onClick={() => create()} className="rounded-lg bg-teal-700 px-4 py-2 text-sm text-white disabled:opacity-50">{text("+ 직접 추가", "+ Add manually")}</button></div>
    <div className="my-4 flex flex-wrap gap-3"><label className="text-sm">{text("검색", "Search")}<input value={filter} onChange={e => setFilter(e.target.value)} className="ml-2 rounded border border-slate-300 bg-white px-3 py-2" /></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} />{text("보관함 포함", "Include archived")}</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showCompleted} onChange={e => setShowCompleted(e.target.checked)} />{text("완료된 거래 포함", "Include completed")}</label><button type="button" disabled={reloading || busy} aria-busy={reloading} onClick={() => void load()} className="inline-flex items-center gap-2 rounded-lg border border-teal-700 bg-white px-4 py-2 text-sm font-medium text-teal-800 disabled:opacity-50"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><path d="M20 7v5h-5M4 17v-5h5M5.3 8a7 7 0 0 1 11.5-3L20 8M4 16l3.2 3A7 7 0 0 0 18.7 16" /></svg>{reloading ? text("불러오는 중…", "Loading…") : text("거래 목록 새로고침", "Reload transactions")}</button><button type="button" onClick={() => setShowStatements(!showStatements)} className="text-sm underline">{text("명세서 원본 행", "Statement source rows")} ({statements.length})</button></div>
    {message && <p role="status" className="my-3 rounded bg-amber-50 p-3 text-sm text-amber-900">{message}</p>}
    {!!data.actualEditProposals?.length && <section className="my-4 rounded-xl border border-red-300 bg-red-50 p-4"><h4 className="font-semibold text-red-800">{text("검토 필요 수정안 · 계좌 재배정 포함","Changes needing review · including account reassignment")}</h4><p className="my-2 text-sm text-red-800">{text("미완성 수정안은 저장되어 있지만 아직 확정 내역에 반영되지 않았습니다. 각 항목을 열어 보완하세요.","Unfinished changes are saved but have not changed confirmed records. Open an entry to complete it.")}</p>{data.actualEditProposals.map(proposal => { const actual = data.actuals.find(a => a.id === proposal.original_actual_id); return actual ? <details key={proposal.id} className="mt-3 rounded border border-red-200 bg-white p-3"><summary className="cursor-pointer text-sm font-medium">{actual.occurred_on} · {actual.description}</summary><ActualInlineEditor key={proposal.updated_at} actual={actual} data={data} supabase={supabase} onSaved={refresh} onCancel={() => {}} /></details> : null; })}</section>}
    {!data.accounts.some(a => a.is_active) && <p className="my-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{text("결제 계좌·카드가 아직 등록되지 않았습니다. 기록은 저장되어 있으며, 계좌를 등록한 뒤 지출 내역에 반영할 수 있습니다. 전체 계좌번호는 필요하지 않습니다.", "No payment account/card has been registered. Your entries are saved; add an account before posting them to Transactions. A full account number is not required.")} <Link href="/workspace/accounts" className="font-medium underline">{text("내 계좌 등록", "Add an account")}</Link></p>}
    {!!confirmations.length && <section className="my-4"><h4 className="text-lg font-semibold">{text("품목별 원화 배분", "KRW allocated by item")}</h4><p className="my-2 text-sm text-slate-600">{text("연결된 영수증은 아래에 자동 배분됩니다. 한 품목이면 전액, 여러 품목이면 금액 비율로 나누며 합계는 카드사의 최종 출금액과 같습니다. 명세서 연결이 불확실한 거래는 임의로 배분하지 않습니다.", "Linked receipts are allocated below: one item receives the full debit; multiple items share it proportionally. Each allocation totals the final card debit. Uncertain statement matches are not guessed.")}</p><div className="grid gap-4 xl:grid-cols-2">{active.filter(d => debitFor(d) !== undefined).map(d => <ReceiptDebitBreakdown key={d.id} date={d.occurred_on} merchant={d.description} originalMinor={d.original_amount_minor} currency={d.currency_code} debitKrw={debitFor(d)!} items={Array.isArray(d.evidence.items) ? d.evidence.items : []} locale={locale} />)}</div><p className="mt-3 text-xs text-slate-500">{text("배분은 확인된 출금액의 분석입니다. 계좌 잔액 반영은 결제 기록을 저장한 뒤에 이루어집니다.", "Allocation analyzes a confirmed debit. Account balances change only after saving the settlement.")}</p></section>}
    {!loaded && <p>{text("불러오는 중…", "Loading…")}</p>}
    <div className="mb-3 flex justify-end"><SortControl label={text("정렬","Sort")} value={draftSort} onChange={setDraftSort} options={[
      { value: "date-desc", label: text("날짜 · 최신순", "Date · newest first") },
      { value: "date-asc", label: text("날짜 · 오래된 순", "Date · oldest first") },
      { value: "description", label: text("내용 · ㄱ-ㅎ / A-Z", "Description · A-Z") },
      { value: "amount-asc", label: text("원거래 금액 · 통화별 낮은 순", "Original amount · low within currency") },
      { value: "amount-desc", label: text("원거래 금액 · 통화별 높은 순", "Original amount · high within currency") },
      { value: "status", label: text("상태", "Status") },
    ]} /></div>
    {(creating || editing) && <form onSubmit={save} className="mb-5 grid gap-3 rounded-xl bg-white p-4 ring-1 ring-slate-200 sm:grid-cols-2 lg:grid-cols-4">
      <h4 className="font-semibold sm:col-span-2 lg:col-span-4">{editing ? text("거래 보충 / 수정", "Complete / edit entry") : text("새 거래 초안", "New transaction draft")}{frozen && <span className="ml-3 text-sm font-normal">{text("확정된 원거래는 변경 불가 · 원화 참고값과 메모는 보충 가능", "Settled facts are locked; reference values and notes can be added")}</span>}</h4>
      {editingDebit !== undefined && <div className="sm:col-span-2 lg:col-span-4 rounded bg-teal-50 p-3 text-sm"><p>{text("확인된 최종 출금액", "Confirmed final debit")}: {formatMinor(BigInt(editingDebit),"KRW")}</p>{allocations ? <><p className="my-2">{text("계산된 품목별 원화 배분 · 할인은 비례 반영 · 추가 지출 아님", "Calculated proportional allocation · discounts shared · not additional spending")}</p><ul>{allocations.map((row,i)=><li key={i}>{row.unitemized ? text("품목 미확인 잔액", "Unitemized remainder") : row.label}: {formatMinor(BigInt(row.amountKrw),"KRW")}</li>)}</ul></> : <p>{text("품목 금액이 부족하거나 불명확하면 임의로 배분하지 않습니다.", "Incomplete or ambiguous item amounts are not invented.")}</p>}</div>}
      <label className="text-sm">{text("날짜 *", "Date *")}<input required disabled={frozen} type="date" value={fields.date} onChange={e => change("date", e.target.value)} className="mt-1 w-full rounded border p-2 disabled:bg-slate-100" /></label>
      <label className="text-sm lg:col-span-2">{text("상점 / 내용 *", "Merchant / description *")}<input required disabled={frozen} maxLength={500} value={fields.description} onChange={e => change("description", e.target.value)} className="mt-1 w-full rounded border p-2 disabled:bg-slate-100" /></label>
      <label className="text-sm">{text("수입 / 지출", "Direction")}<select disabled={frozen} value={fields.direction} onChange={e => change("direction", e.target.value)} className="mt-1 w-full rounded border p-2"><option value="outflow">{text("지출", "Expense")}</option><option value="inflow">{text("수입", "Income")}</option></select></label>
      <label className="text-sm">{text("원래 금액 *", "Original amount *")}<input required disabled={frozen} inputMode="decimal" value={fields.amount} onChange={e => change("amount", e.target.value)} className="mt-1 w-full rounded border p-2 disabled:bg-slate-100" /></label>
      <label className="text-sm">{text("원래 통화 *", "Original currency *")}<CurrencySelect required disabled={frozen} value={fields.currency as CurrencyCode | ""} onChange={(code) => change("currency", code)} locale={locale} className="block w-full rounded border p-2" /></label>
      <label className="text-sm">{text("결제수단 이름", "Payment method name")}<input maxLength={100} value={fields.paymentMethod} onChange={e => change("paymentMethod", e.target.value)} className="mt-1 w-full rounded border p-2" /></label>
      <label className="text-sm">{text("원화 명세서 참고값 (선택)", "KRW statement reference (optional)")}<input inputMode="numeric" value={fields.referenceKrw} onChange={e => change("referenceKrw", e.target.value)} className="mt-1 w-full rounded border p-2" /><span className="text-xs text-slate-500">{text("실제 출금액 아님 · 환율로 다시 계산하지 않음", "Not an actual debit; never recalculated using FX")}</span></label>
      <label className="text-sm">{text("계좌·카드 (나중에 선택 가능)", "Account / card (can choose later)")}<select disabled={frozen} value={fields.accountId} onChange={e => change("accountId", e.target.value)} className="mt-1 w-full rounded border p-2"><option value="">{text("아직 선택하지 않음", "Not selected yet")}</option>{data.accounts.filter(a => a.is_active).map(a => <option key={a.id} value={a.id}>{a.name} ({a.currency_code})</option>)}</select></label>
      <label className="text-sm">{text("분류 (선택)", "Category (optional)")}<select disabled={frozen} value={fields.categoryId} onChange={e => change("categoryId", e.target.value)} className="mt-1 w-full rounded border p-2"><option value="">{text("미분류", "Uncategorized")}</option>{data.categories.filter(c => c.is_active && c.normal_direction === fields.direction).map(c => <option key={c.id} value={c.id}>{c.major_name} / {c.name}</option>)}</select></label>
      <label className="text-sm sm:col-span-2">{text("연결할 명세서 거래 (직접 확인)", "Statement row to link (review yourself)")}<select value={fields.statementId} onChange={e => { const row = statements.find(s => s.id === e.target.value); setFields(f => ({ ...f, statementId: e.target.value, referenceKrw: row?.reported_krw_minor == null ? f.referenceKrw : String(row.reported_krw_minor) })); }} className="mt-1 w-full rounded border p-2"><option value="">{text("미연결", "Not linked")}</option>{choices.map(s => <option key={s.id} value={s.id}>{candidates.some(c => c.id === s.id) ? "★ " : ""}{s.occurred_on} · {s.description} · {s.currency_code && s.original_amount_minor != null ? formatMinor(BigInt(s.original_amount_minor), s.currency_code) : text("통화 확인 필요", "Currency unknown")}</option>)}</select><p className="mt-1 text-xs text-slate-500">{text("★는 날짜·금액·통화가 가까운 후보입니다. 자동 연결하지 않습니다. 같은 명세서 거래는 한 번만 연결할 수 있습니다.", "★ marks a date/amount/currency candidate, not an automatic match. A statement row can be linked only once.")}</p></label>
      <label className="text-sm sm:col-span-2 lg:col-span-4">{text("메모 (선택)", "Notes (optional)")}<textarea maxLength={2000} value={fields.notes} onChange={e => change("notes", e.target.value)} className="mt-1 w-full rounded border p-2" /></label>
      <div className="flex flex-wrap gap-3 sm:col-span-2 lg:col-span-4"><button disabled={busy} className="rounded bg-teal-700 px-4 py-2 text-sm text-white">{text("변경 저장", "Save changes")}</button><button type="button" onClick={() => { setCreating(false); setEditing(null); }} className="text-sm underline">{text("닫기", "Close")}</button>{editing && <button type="button" onClick={async () => { const r = await supabase.from("transaction_draft_events").select("id,created_at").eq("draft_id", editing.id).eq("user_id", userId).order("created_at", { ascending: false }); if (r.error) setMessage(text("이력을 불러오지 못했습니다.", "Could not load history.")); else setHistory(r.data); }} className="text-sm underline">{text("변경 이력 확인", "Show change history")}</button>}</div>
      {!!history.length && <p className="text-sm sm:col-span-2 lg:col-span-4">{text("저장된 이력", "Saved history")}: {history.map(h => new Date(h.created_at).toLocaleString(locale)).join(" · ")}</p>}
      {editing && Array.isArray(editing.evidence.items) && <details className="sm:col-span-2 lg:col-span-4"><summary className="cursor-pointer text-sm underline">{text("확인된 영수증 품목 보기", "View reviewed receipt items")}</summary><div className="mt-3 overflow-auto"><table className="w-full text-left text-sm"><thead><tr>{[text("품목", "Item"), text("수량", "Quantity"), text("단가", "Unit price"), text("품목 금액", "Item total"), text("품목 코드", "Product code")].map(label => <th key={label} className="p-2">{label}</th>)}</tr></thead><tbody>{editing.evidence.items.map((item, index) => <tr key={index} className="border-b">{["Description", "Quantity", "Price", "TotalPrice", "ProductCode"].map(key => { const value = item && typeof item === "object" ? (item as Record<string, unknown>)[key] : null; return <td key={key} className="p-2">{value == null ? "—" : typeof value === "object" ? JSON.stringify(value) : String(value)}</td>; })}</tr>)}</tbody></table></div><p className="mt-2 text-xs text-slate-500">{text("품목은 영수증 원본의 확인된 정보입니다. 거래 합계에 다시 더하지 않습니다.", "These reviewed source items are not added to the transaction total again.")}</p></details>}
    </form>}
    <div className="overflow-x-auto"><table className="w-full min-w-[950px] text-left text-sm"><thead><tr className="border-b border-slate-200"><th className="p-2">{text("날짜", "Date")}</th><th className="p-2">{text("내용 / 결제수단", "Description / payment method")}</th><th className="p-2">{text("원거래 금액", "Original amount")}</th><th className="p-2">{text("원화 금액", "KRW amount")}</th><th className="p-2">{text("상태", "Status")}</th><th className="p-2">{text("작업", "Actions")}</th></tr></thead><tbody>{active.map(d => <Fragment key={d.id}><tr className="border-b border-slate-100 bg-white"><td className="p-2">{d.occurred_on}</td><td className="p-2"><p>{d.description}</p><p className="text-xs text-slate-500">{d.payment_method || "—"}</p></td><td className="p-2">{formatMinor(BigInt(d.original_amount_minor), d.currency_code)}</td><td className="p-2">{d.reference_krw_minor === null ? text("나중에 보충", "Add later") : formatMinor(BigInt(d.reference_krw_minor), "KRW")}</td><td className="p-2">{d.archived ? text("보관함", "Archived") : d.settled_actual_id ? text("결제 확정", "Settled") : debitFor(d) !== undefined ? text("출금 확인됨 · 계좌 반영 전", "Debit confirmed · not posted") : text("출금 확인 전", "Debit not confirmed")}</td><td className="p-2"><div className="flex flex-wrap gap-3"><button type="button" disabled={busy || blocked} onClick={() => { setConfirming(null); open(d); }} className="underline disabled:opacity-50">{text("보충 / 수정", "Complete / edit")}</button>{!d.settled_actual_id && !d.archived && <button type="button" disabled={busy || blocked || confirming !== null} onClick={() => onApply(d)} className="text-teal-800 underline disabled:opacity-50">{text("거래 확정", "Confirm transaction")}</button>}<button type="button" disabled={busy || blocked} onClick={() => void archive(d)} className="text-slate-500 underline disabled:opacity-50">{d.archived ? text("복원", "Restore") : text("보관", "Archive")}</button></div></td></tr>{confirming?.id === d.id && <tr><td colSpan={6}><div className="my-3"><button type="button" onClick={() => setConfirming(null)} className="mb-2 rounded border px-3 py-2">{text("확정 입력 닫기", "Close confirmation")}</button><ActualsPanel compact key={d.id} draft={confirming} data={data} userId={userId} supabase={supabase} refresh={async () => { setConfirming(null); await refresh(); await load(); }} /></div></td></tr>}</Fragment>)}</tbody></table></div>
    {loaded && !active.length && <p className="py-4 text-sm">{text("현재 조건에 맞는 보완 필요 거래가 없습니다. 완료된 거래나 보관함을 포함하여 확인할 수 있습니다.", "No entries match these filters. Include completed or archived entries to review previous records.")}</p>}
    {showStatements && <section className="mt-5"><h4 className="font-semibold">{text("명세서 원본 행 · 자동 지출 아님", "Statement source rows · not automatically posted")}</h4><p className="my-2 text-sm text-slate-600">{text("승인 단계와 취소 거래는 확정 지출로 가져오지 않습니다. 원화 표시값은 실제 출금 통화가 확인되기 전까지 참고 자료입니다.", "Pending approvals and canceled rows are not imported as settled spending. KRW display values remain reference evidence until the actual debit currency is confirmed.")}</p><div className="max-h-[500px] overflow-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead><tr><th className="p-2">{text("날짜", "Date")}</th><th className="p-2">{text("가맹점", "Merchant")}</th><th className="p-2">{text("해외이용금액", "Foreign amount")}</th><th className="p-2">{text("원화 표시 (확인 필요)", "KRW display (needs confirmation)")}</th><th className="p-2">{text("상태", "Status")}</th><th className="p-2">{text("작업", "Action")}</th></tr></thead><tbody>{statements.map(s => { const linked = drafts.some(d => d.statement_evidence_id === s.id || d.source_key === `statement:${s.source_key}`); return <tr key={s.id} className="border-b border-slate-200 bg-white"><td className="p-2">{s.occurred_on}</td><td className="p-2">{s.description}</td><td className="p-2">{s.currency_code && s.original_amount_minor != null ? formatMinor(BigInt(s.original_amount_minor), s.currency_code) : text("통화 / 금액 확인 필요", "Confirm currency / amount")}</td><td className="p-2">{s.reported_krw_minor === null ? "—" : formatMinor(BigInt(s.reported_krw_minor), "KRW")}</td><td className="p-2">{s.status === "confirmed" ? text("결제확정", "Confirmed") : s.status === "approved" ? text("승인 단계", "Pending approval") : text("취소", "Canceled")}</td><td className="p-2"><button type="button" disabled={busy || blocked || linked || s.status !== "confirmed"} onClick={() => create(s)} className="underline disabled:opacity-40">{linked ? text("이미 연결됨", "Already linked") : text("초안 만들기", "Create draft")}</button></td></tr>; })}</tbody></table></div></section>}
  </section>;
}
