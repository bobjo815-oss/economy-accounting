"use client";
import { useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useLanguage } from "@/lib/i18n/provider";
import { correctionFields, correctionPayload, storedCorrectionFields, type CorrectionFields } from "@/lib/finance/actual-correction";
import type { ActualRow, WorkspaceData } from "@/lib/finance/records";

export default function ActualInlineEditor({ actual, data, supabase, onSaved, onCancel }: { actual: ActualRow; data: WorkspaceData; supabase: SupabaseClient; onSaved: () => Promise<void>; onCancel: () => void }) {
  const { locale } = useLanguage();
  const text = (ko: string, en: string) => locale === "ko" ? ko : en;
  const savedProposal = data.actualEditProposals?.find(p => p.original_actual_id === actual.id);
  const [fields, setFields] = useState(() => storedCorrectionFields(savedProposal?.fields) ?? correctionFields(actual,data));
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState("");
  const change = (key: keyof CorrectionFields, value: string) => setFields(f => {
    if (key === "accountId" && data.accounts.find(a => a.id === f.accountId)?.currency_code !== data.accounts.find(a => a.id === value)?.currency_code) return { ...f, accountId: value, settled: "", fee: "0" };
    return { ...f, [key]: value };
  });
  async function save(event: FormEvent) {
    event.preventDefault();
    const payload = correctionPayload(fields,data);
    if (!payload) { setMessage(text("날짜·금액·계좌·분류와 품목 배분 합계를 확인하세요.","Check the date, amounts, account, category and split totals.")); return; }
    setBusy(true); setMessage("");
    try {
      const result = await supabase.rpc("correct_settled_actual",{ p_original_id: actual.id, ...payload });
      if (result.error || !result.data) throw new Error("Not saved");
      await onSaved();
    } catch { setMessage(text("수정하지 못했습니다. 다른 화면에서 이미 수정했는지 확인하고 목록을 새로고침하세요.","Not saved. Reload the list and check whether this entry was already corrected elsewhere.")); }
    finally { setBusy(false); }
  }
  async function saveProposal() {
    setBusy(true); setMessage("");
    try {
      const payload = { user_id: actual.user_id, original_actual_id: actual.id, fields, status: "pending", updated_at: new Date().toISOString() };
      const result = savedProposal ? await supabase.from("actual_edit_proposals").update(payload).eq("user_id",actual.user_id).eq("id",savedProposal.id).eq("updated_at",savedProposal.updated_at).select("id") : await supabase.from("actual_edit_proposals").insert(payload).select("id");
      if (result.error || !result.data?.length) throw new Error("Not saved");
      await onSaved();
    } catch { setMessage(text("수정안을 저장하지 못했습니다. 다른 화면의 변경을 확인하고 다시 불러오세요.","Could not save the proposal. Check concurrent changes and reload.")); }
    finally { setBusy(false); }
  }
  async function discardProposal() {
    if (!savedProposal) return;
    setBusy(true);
    const result = await supabase.from("actual_edit_proposals").update({ status:"discarded",updated_at:new Date().toISOString() }).eq("user_id",actual.user_id).eq("id",savedProposal.id).eq("updated_at",savedProposal.updated_at).select("id");
    setBusy(false);
    if (result.error || !result.data?.length) setMessage(text("수정안을 지우지 못했습니다. 다시 불러오세요.","Could not discard the proposal. Reload.")); else await onSaved();
  }
  const direction = ["income","loan_drawdown"].includes(fields.kind) ? "inflow" : "outflow";
  const account = data.accounts.find(a => a.id === fields.accountId);
  const invalid = correctionPayload(fields,data) === null;
  return <form onSubmit={save} className="my-3 grid gap-3 rounded-xl border border-teal-200 bg-teal-50 p-4 sm:grid-cols-2 lg:grid-cols-4" aria-label={text("거래 바로 수정","Edit transaction inline")}>
    <p className="text-sm sm:col-span-2 lg:col-span-4">{text("여기에서 수정하세요. 저장하면 원본을 보존하고 취소 기록과 수정 거래를 함께 남깁니다. 실제 카드 결제를 취소하는 것은 아닙니다.","Edit here. Saving preserves the original and records its reversal and replacement together. This does not cancel a real card payment.")}</p>
    {invalid && <p role="status" className="rounded border border-red-300 bg-red-50 p-3 text-red-800 sm:col-span-2 lg:col-span-4">{text("검토 필요: 입력값이나 배분 합계를 확인하세요. 미완성 수정안으로 저장할 수 있으며, 확정 잔액은 바뀌지 않습니다.","Needs review: check inputs or split totals. You can save unfinished changes; confirmed balances stay unchanged.")}{fields.splits.length > 0 && <span className="block">{text("입력된 배분 금액","Entered split amounts")}: {fields.splits.map(s => s.amount).join(" + ")} / {text("거래 금액","Transaction amount")}: {fields.amount} {fields.currency}</span>}</p>}
    {([ ["date",text("거래일","Date"),"date"], ["description",text("내용","Description"),"text"], ["amount",text("원거래 금액","Original amount"),"text"], ["settled",text("계좌 반영 금액","Final account amount") + (account ? ` (${account.currency_code})` : ""),"text"] ] as const).map(([key,label,type]) => <label key={key} className="text-sm">{label}<input required maxLength={key === "description" ? 500 : undefined} type={type} inputMode={key === "amount" || key === "settled" ? "decimal" : undefined} value={fields[key]} onChange={e => change(key,e.target.value)} className="mt-1 w-full rounded border bg-white p-2" /></label>)}
    <details open={actual.explicit_fee_minor > 0 || (fields.fee !== "" && Number(fields.fee) !== 0)} className="text-sm sm:col-span-2 lg:col-span-4"><summary className="cursor-pointer text-slate-600">{text("별도로 청구된 수수료가 있는 경우만","Only for a separately charged fee")}</summary><p className="my-2 text-xs text-slate-500">{text("별도 청구액을 아는 경우에만 입력하세요. 환율 마진이나 환불 차액은 수수료로 추정하지 않습니다. 최종 지급액에 포함된 비용은 다시 더하지 않습니다.","Enter only a known separate charge. Exchange-rate margins or refund differences are not inferred fees. Do not add costs included in the final payment again.")}</p><label>{text("별도 수수료","Separate fee")}<input inputMode="decimal" value={fields.fee} onChange={e => change("fee",e.target.value)} className="mt-1 w-full rounded border bg-white p-2" /></label></details>
    <label>{text("원거래 통화","Original currency")}<select value={fields.currency} onChange={e => change("currency",e.target.value)} className="mt-1 w-full rounded border bg-white p-2">{["GBP","KRW","USD"].map(c => <option key={c}>{c}</option>)}</select></label>
    <label>{text("계좌·카드","Account / card")}<select required value={fields.accountId} onChange={e => change("accountId",e.target.value)} className="mt-1 w-full rounded border bg-white p-2"><option value="">{text("선택","Choose")}</option>{data.accounts.filter(a => a.is_active).map(a => <option key={a.id} value={a.id}>{a.name} ({a.currency_code})</option>)}</select></label>
    <label>{text("유형","Type")}<select value={fields.kind} onChange={e => change("kind",e.target.value)} className="mt-1 w-full rounded border bg-white p-2">{([ ["income",text("수입","Income")],["expense",text("지출","Expense")],["loan_drawdown",text("대출금 수령","Loan drawdown")],["loan_principal",text("대출 원금 상환","Loan principal")],["loan_interest",text("대출 이자","Loan interest")] ]).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <label>{text("분류","Category")}<select disabled={fields.splits.length > 0} value={fields.categoryId} onChange={e => change("categoryId",e.target.value)} className="mt-1 w-full rounded border bg-white p-2"><option value="">{text("미분류","Uncategorized")}</option>{data.categories.filter(c => c.is_active && c.normal_direction === direction).map(c => <option key={c.id} value={c.id}>{c.major_name} / {c.name}</option>)}</select></label>
    <label>{text("연결된 계획","Linked plan")}<select value={fields.planId} onChange={e => change("planId",e.target.value)} className="mt-1 w-full rounded border bg-white p-2"><option value="">{text("미연결","Not linked")}</option>{data.plans.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select></label>
    {fields.splits.map((split,index) => <div key={index} className="flex gap-2 sm:col-span-2 lg:col-span-4"><label>{text("배분 분류","Split category")} {index+1}<select value={split.categoryId} onChange={e => setFields(f => ({ ...f, splits: f.splits.map((s,i) => i === index ? { ...s,categoryId: e.target.value } : s) }))} className="ml-2 rounded border p-2">{data.categories.filter(c => c.is_active && c.normal_direction === direction).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>{text("배분 금액","Split amount")} {index+1}<input inputMode="decimal" value={split.amount} onChange={e => setFields(f => ({ ...f,splits: f.splits.map((s,i) => i === index ? { ...s,amount: e.target.value } : s) }))} className="ml-2 rounded border p-2" /></label></div>)}
    {message && <p role="alert" className="text-red-700 sm:col-span-2 lg:col-span-4">{message}</p>}
    {savedProposal && <button type="button" disabled={busy} onClick={() => void discardProposal()} className="justify-self-start text-red-700 underline sm:col-span-2 lg:col-span-4">{text("저장된 수정안 삭제 · 확정 거래는 유지","Discard saved changes · keep confirmed transaction")}</button>}
    <div className="flex flex-wrap gap-3 sm:col-span-2 lg:col-span-4"><button disabled={busy} className="rounded bg-teal-700 px-4 py-2 text-white disabled:opacity-50">{busy ? text("저장 중…","Saving…") : text("수정 확정","Confirm correction")}</button><button type="button" disabled={busy} onClick={() => void saveProposal()} className="rounded border border-red-300 bg-white px-4 py-2 text-red-800">{text("미완성 수정안 저장","Save unfinished changes")}</button><button type="button" disabled={busy} onClick={onCancel} className="rounded border bg-white px-4 py-2">{text("취소","Cancel")}</button></div>
  </form>;
}
