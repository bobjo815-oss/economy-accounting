"use client";
import { useLanguage } from "@/lib/i18n/provider";

import { useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decimalAmountFromMinor, formatMinor, parseSignedAmountToMinor, safeMinorNumber, type CurrencyCode } from "@/lib/finance/money";
import { CurrencySelect } from "./currency-select";
import type { AccountRow } from "@/lib/finance/records";
import SortControl from "./sort-control";

export default function AccountsPanel({ accounts, userId, supabase, refresh, sortOrder, onSortChange }: {
  accounts: AccountRow[]; userId: string; supabase: SupabaseClient; refresh: () => Promise<void>; sortOrder: string; onSortChange: (value: string) => void;
}) {
  const { t, locale } = useLanguage();
  const text = (ko: string,en: string) => locale === "ko" ? ko : en;
  const [editing, setEditing] = useState<AccountRow | null>(null);
  const [showInactive,setShowInactive] = useState(false);
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode>("GBP");
  const [openingBalance, setOpeningBalance] = useState("0");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const minor = parseSignedAmountToMinor(openingBalance, currency);
    const safe = minor === null ? null : safeMinorNumber(minor);
    if (!name.trim() || name.trim().length > 100 || safe === null) {
      setMessage("Enter an account name and a valid opening balance.");
      return;
    }
    setPending(true);
    const result = editing ? await supabase.from("accounts").update({ name: name.trim(), opening_balance_minor: safe }).eq("user_id",userId).eq("id",editing.id).eq("name",editing.name).eq("opening_balance_minor",editing.opening_balance_minor).select("id") : await supabase.from("accounts").insert({ user_id: userId, name: name.trim(), currency_code: currency, opening_balance_minor: safe }).select("id");
    setPending(false);
    if (result.error || !result.data?.length) { setMessage(text("저장하지 못했습니다. 이름 중복이나 다른 화면의 변경을 확인하고 다시 불러오세요.","Not saved. Check duplicate names or concurrent changes, then reload.")); return; }
    setEditing(null); setName(""); setOpeningBalance("0"); setMessage(text("계좌를 저장했습니다.","Account saved."));
    await refresh();
  }

  async function toggle(account: AccountRow) {
    setPending(true);
    const result = await supabase.from("accounts").update({ is_active: !account.is_active }).eq("user_id",userId).eq("id",account.id).eq("is_active",account.is_active).select("id");
    setPending(false);
    if (result.error || !result.data?.length) setMessage(text("변경하지 못했습니다. 목록을 새로고침하세요.","Not changed. Reload the list."));
    else { setMessage(text("거래 기록은 보존됩니다. 사용 중지는 계좌나 카드를 실제로 해지하지 않습니다.","Transaction history is retained. Deactivation does not close a real bank account or card.")); await refresh(); }
  }
  async function remove(account: AccountRow) {
    setPending(true); setMessage("");
    try {
      const checks = await Promise.all([
        ...["actual_transactions","plans","recurring_templates","transaction_drafts"].map(table => supabase.from(table).select("id").eq("user_id",userId).eq("account_id",account.id).limit(1)),
        supabase.from("transfers").select("id").eq("user_id",userId).or(`from_account_id.eq.${account.id},to_account_id.eq.${account.id}`).limit(1),
      ]);
      if (checks.some(result => result.error)) throw new Error("Unable to check dependencies");
      if (checks.some(result => result.data?.length)) {
        if (!window.confirm(text("연결된 기록이 있습니다. 계좌를 목록에서 제거하고 관련 거래를 ‘검토 필요’로 표시할까요? 기존 거래 이력과 이체는 보존됩니다. 계획·정기 항목·미확정 초안의 계좌 연결은 해제됩니다.","Linked records exist. Remove this account from the list and mark transactions for reassignment? History and transfers are retained; plans, templates and unsettled drafts are unassigned."))) return;
        const result = await supabase.rpc("retire_account_for_review",{p_account_id:account.id});
        if (result.error) throw new Error("Not retired");
        setMessage(text("목록에서 제거했습니다. ‘수입·지출 내역’의 빨간 수정안에서 계좌를 다시 선택하세요. 원래 거래 이력과 이체를 보호하기 위해 계좌 기록은 보존되며 복원할 수 있습니다.","Removed from the list. Choose another account in the red transaction proposals. The account record remains restorable to preserve original history and transfers.")); await refresh(); return;
      }
      if (!window.confirm(text("연결된 기록이 없는 계좌를 완전히 삭제할까요? 이 작업은 복원할 수 없습니다.","Permanently delete this unused account? This cannot be restored."))) return;
      const result = await supabase.from("accounts").delete().eq("user_id",userId).eq("id",account.id).select("id");
      if (result.error || !result.data?.length) throw new Error("Not deleted");
      setMessage(text("사용되지 않은 계좌를 삭제했습니다.","Unused account deleted.")); await refresh();
    } catch { setMessage(text("삭제하지 못했습니다. 다른 화면에서 연결된 기록이 생겼는지 확인하세요.","Not deleted. Check whether another screen linked a record.")); }
    finally { setPending(false); }
  }

  return <section id="accounts" className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
    <h2 className="text-lg font-semibold">{t("Accounts")}</h2>
    <p className="mt-1 text-sm text-slate-500">{text("이름과 시작 잔액을 수정할 수 있습니다. 더 이상 쓰지 않는 계좌는 사용 중지하고 나중에 복원하세요. 거래 기록은 삭제되지 않습니다.","Edit names and opening balances. Deactivate unused accounts and restore them later. Transaction history is retained.")}</p>
    {editing && <p className="mt-3 rounded bg-amber-50 p-3 text-sm">{text("계좌 수정 중: 시작 잔액을 바꾸면 현재 잔액과 예측도 바뀝니다. 통화는 기존 금액의 의미를 보존하기 위해 변경하지 않습니다. 다른 통화는 새 계좌로 등록하세요.","Editing: changing the opening balance changes balances and forecasts. Currency remains fixed to preserve existing amounts; add a separate account for another currency.")}</p>}
    <form onSubmit={submit} className="mt-5 grid gap-3 sm:grid-cols-[1fr_220px_160px_auto]">
      <label className="text-sm">{t("Name")}<input required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
      <label className="text-sm">{t("Currency")}<CurrencySelect disabled={Boolean(editing)} value={currency} onChange={setCurrency} locale={locale} className="block w-full rounded-lg border border-slate-300 bg-white px-2 py-2" /></label>
      <label className="text-sm">{t("Opening balance")}<input required inputMode="decimal" value={openingBalance} onChange={(event) => setOpeningBalance(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
      <div className="flex items-end"><button disabled={pending} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{editing ? text("수정 저장","Save changes") : t("Add")}</button>{editing && <button type="button" onClick={() => { setEditing(null); setName(""); setOpeningBalance("0"); }} className="ml-3 underline">{text("취소","Cancel")}</button>}</div>
    </form>
    {message && <p role="status" className="mt-2 text-sm text-slate-600">{t(message)}</p>}
    <label className="mt-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />{text("사용 중지된 계좌 포함","Include inactive accounts")}</label>
    <div className="mt-4 flex justify-end"><SortControl label={text("정렬","Sort")} value={sortOrder} onChange={onSortChange} options={[
      { value: "name", label: text("이름 · ㄱ-ㅎ / A-Z", "Name · A-Z") },
      { value: "currency", label: text("통화", "Currency") },
      { value: "balance-asc", label: text("시작 잔액 · 통화별 낮은 순", "Opening balance · low within currency") },
      { value: "balance-desc", label: text("시작 잔액 · 통화별 높은 순", "Opening balance · high within currency") },
    ]} /></div>
    <ul className="mt-5 divide-y divide-slate-100">{accounts.filter(a => showInactive || a.is_active).map((account) => <li key={account.id} className="flex justify-between gap-4 py-3 text-sm"><span>{account.name}{!account.is_active && <span className="ml-2 text-slate-500">{text("사용 중지","Inactive")}</span>}</span><span className="font-medium">{formatMinor(BigInt(account.opening_balance_minor), account.currency_code)}</span><div className="flex gap-3"><button type="button" disabled={pending || editing !== null} onClick={() => { setEditing(account); setName(account.name); setCurrency(account.currency_code); setOpeningBalance(decimalAmountFromMinor(account.opening_balance_minor, account.currency_code)); setMessage(""); }} className="underline">{text("수정","Edit")}</button><button type="button" disabled={pending || editing !== null} onClick={() => void toggle(account)} className="underline">{account.is_active ? text("사용 중지","Deactivate") : text("복원","Restore")}</button><button type="button" disabled={pending || editing !== null} onClick={() => void remove(account)} className="text-red-700 underline">{text("삭제","Delete")}</button></div></li>)}</ul>
    {accounts.length === 0 && <p className="mt-5 text-sm text-slate-500">{t("Add an account to begin tracking cash.")}</p>}
  </section>;
}
