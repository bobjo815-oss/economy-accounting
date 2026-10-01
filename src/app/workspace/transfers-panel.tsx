"use client";
import { localDate } from "@/lib/finance/local-date";
import { useLanguage } from "@/lib/i18n/provider";

import { useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatMinor, parseAmountToMinor, parseRate, safeMinorNumber } from "@/lib/finance/money";
import { transferLegs } from "@/lib/finance/transfer";
import type { WorkspaceData } from "@/lib/finance/records";
import SortControl from "./sort-control";

export default function TransfersPanel({ data, userId, supabase, refresh, sortOrder, onSortChange }: {
  data: WorkspaceData; userId: string; supabase: SupabaseClient; refresh: () => Promise<void>; sortOrder: string; onSortChange: (value: string) => void;
}) {
  const { t, locale } = useLanguage();
  const text = (ko: string, en: string) => locale === "ko" ? ko : en;
  const [date, setDate] = useState(() => localDate(data.profile?.timezone));
  const [description, setDescription] = useState("");
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [sent, setSent] = useState("");
  const [received, setReceived] = useState("");
  const [fee, setFee] = useState("");
  const [rate, setRate] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const from = data.accounts.find((account) => account.id === fromId);
  const to = data.accounts.find((account) => account.id === toId);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!from || !to || from.id === to.id) { setMessage("Choose two different accounts."); return; }
    const sentMinor = parseAmountToMinor(sent, from.currency_code);
    const receivedMinor = parseAmountToMinor(received, to.currency_code);
    const feeMinor = parseAmountToMinor(fee || "0", from.currency_code);
    if (!date || !description.trim() || !sentMinor || !receivedMinor || sentMinor <= BigInt(0) || receivedMinor <= BigInt(0) ||
      feeMinor === null || safeMinorNumber(sentMinor) === null || safeMinorNumber(receivedMinor) === null || safeMinorNumber(feeMinor) === null) {
      setMessage("Enter a date, description, and valid positive transfer amounts."); return;
    }
    if (from.currency_code === to.currency_code && sentMinor !== receivedMinor) {
      setMessage("A same-currency transfer must move the same principal into and out of the accounts."); return;
    }
    if (rate.trim() && (from.currency_code === to.currency_code || !parseRate(rate))) {
      setMessage("Enter a valid observed FX rate for a cross-currency transfer."); return;
    }
    setPending(true);
    try {
      let snapshotId: string | null = null;
      if (rate.trim()) {
        const snapshot = await supabase.from("fx_snapshots").insert({
          user_id: userId, from_currency: from.currency_code, to_currency: to.currency_code,
          rate: rate.trim(), observed_on: date, purpose: "transfer", source_label: "Transfer statement (manual)",
        }).select("id").single();
        if (snapshot.error || !snapshot.data) throw new Error("Transfer rate could not be saved.");
        snapshotId = snapshot.data.id as string;
      }
      const { error } = await supabase.from("transfers").insert({
        user_id: userId, occurred_on: date, description: description.trim(),
        from_account_id: from.id, to_account_id: to.id,
        from_amount_minor: Number(sentMinor), to_amount_minor: Number(receivedMinor),
        explicit_fee_minor: Number(feeMinor), transfer_fx_snapshot_id: snapshotId,
      });
      if (error) throw new Error("Transfer could not be saved.");
      setDescription(""); setSent(""); setReceived(""); setFee(""); setRate("");
      setMessage("Transfer saved with two account legs. Principal is excluded from cash-flow totals.");
      await refresh();
    } catch { setMessage("Transfer could not be saved. Check the selected accounts and database setup."); }
    finally { setPending(false); }
  }

  return <section id="transfers" className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
    <section aria-labelledby="transfer-guide" className="mb-6 rounded-xl border border-teal-200 bg-teal-50 p-5">
      <h2 id="transfer-guide" className="text-lg font-semibold">{text("내 돈의 위치만 바뀔 때 사용하세요", "Use this when your money changes accounts")}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-700">{text("저축 계좌에서 생활비 계좌로 돈을 옮겨도 새로 벌거나 쓴 것은 아니죠. 이체로 기록하면 보내는 계좌의 잔액은 줄고 받는 계좌의 잔액은 늘지만, 수입·지출을 부풀리지 않습니다. 실제 송금 기능이 아니라, 이미 한 이체를 기록하는 기능입니다.", "Moving money from savings to your current account is not new income or spending. A transfer reduces one account’s balance and increases the other without inflating your income or expenses. This only records a transfer you have already made; it does not move money at your bank.")}</p>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <div className="rounded-lg bg-white p-4">
          <h3 className="font-medium">{text("이런 경우에 쓰세요", "Typical examples")}</h3>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-700">
            <li>{text("저축 계좌 ↔ 입출금·생활비 계좌", "Savings account ↔ current account")}</li>
            <li>{text("한국 원화 계좌 → 내 영국 파운드 계좌: 보낸 원화와 받은 파운드를 각각 기록", "Your Korean KRW account → your UK GBP account: record the amount sent and received in each currency")}</li>
            <li>{text("증권 계좌의 현금(예수금) → 내 은행 계좌: 주식 자체가 아니라 현금을 옮기는 경우", "Cash in your investment account → your bank account: transferring cash, not the shares themselves")}</li>
          </ul>
        </div>
        <div className="rounded-lg bg-white p-4">
          <h3 className="font-medium">{text("예시: 저축 계좌에서 생활비 계좌로 £100", "Example: £100 from savings to your current account")}</h3>
          <dl className="mt-3 space-y-2 text-sm"><div className="flex justify-between gap-3"><dt>{text("저축 계좌", "Savings")}</dt><dd>−£100</dd></div><div className="flex justify-between gap-3"><dt>{text("생활비 계좌", "Current account")}</dt><dd>+£100</dd></div><div className="flex justify-between gap-3 border-t border-slate-200 pt-2 font-medium"><dt>{text("내 돈의 총액 변화 (수수료 없음)", "Change in total money (no fee)")}</dt><dd>£0</dd></div></dl>
          <p className="mt-3 text-sm leading-6 text-slate-600">{text("보내는 계좌에서 수수료 £1을 추가로 냈다면 그 계좌에서는 총 £101이 빠지고, 받는 계좌에는 £100이 들어옵니다. 지출은 수수료 £1뿐입니다.", "If the sending account also pays a separate £1 fee, £101 leaves it and £100 arrives. Only the £1 fee is spending.")}</p>
        </div>
      </div>
      <p className="mt-4 text-sm leading-6 text-slate-700"><strong>{text("이체가 아닌 경우: ", "Not a transfer: ")}</strong>{text("월급을 받거나 월세·물건값을 내는 것은 ‘수입·지출 내역’에 기록하세요. 주식 매수·매도와 투자 수익 계산은 현재 지원하지 않습니다. 주식을 판 뒤 현금이 된 돈을 내 계좌로 옮기는 부분만 여기서 기록할 수 있습니다.", "Record wages, rent, and purchases under Transactions. Share purchases, sales, and investment returns are not currently supported. After a share sale has settled into cash, only the movement of that cash between your own accounts belongs here.")}</p>
      <p className="mt-2 text-sm leading-6 text-slate-700">{text("먼저 ‘내 계좌’에 양쪽 계좌를 등록하세요. 하나의 이체는 여기서 한 번만 기록하고, 같은 금액을 수입과 지출로 다시 추가하지 마세요. 계좌를 하나만 관리한다면 이 기능은 쓰지 않아도 됩니다.", "Add both accounts under Accounts first. Record each transfer once here, not again as separate income and spending. If you track only one account, you can leave this feature unused.")}</p>
    </section>
    <h2 className="text-lg font-semibold">{text("이체 내역 기록하기", "Record a transfer")}</h2>
    <form onSubmit={submit} className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="text-sm lg:col-span-2">{t("Description")}<input required maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
      <label className="text-sm">{t("Date")}<input required type="date" value={date} onChange={(event) => setDate(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
      <div />
      <label className="text-sm">{t("From account")}<select required value={fromId} onChange={(event) => { setFromId(event.target.value); setRate(""); }} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="">{t("Choose account")}</option>{data.accounts.filter((account) => account.is_active).map((account) => <option key={account.id} value={account.id}>{account.name} ({account.currency_code})</option>)}</select></label>
      <label className="text-sm">{t("To account")}<select required value={toId} onChange={(event) => { setToId(event.target.value); setRate(""); }} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="">{t("Choose account")}</option>{data.accounts.filter((account) => account.is_active).map((account) => <option key={account.id} value={account.id}>{account.name} ({account.currency_code})</option>)}</select></label>
      <label className="text-sm">{t("Sent principal")}{" "}{from ? `(${from.currency_code})` : ""}<input required inputMode="decimal" value={sent} onChange={(event) => setSent(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
      <label className="text-sm">{t("Received principal")}{" "}{to ? `(${to.currency_code})` : ""}<input required inputMode="decimal" value={received} onChange={(event) => setReceived(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
      <label className="text-sm">{t("Separate fee")}{" "}{from ? `(${from.currency_code})` : ""}<input inputMode="decimal" value={fee} onChange={(event) => setFee(event.target.value)} placeholder="0" className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
      {from && to && from.currency_code !== to.currency_code && <label className="text-sm">{t("Observed FX rate, if known")}<input inputMode="decimal" value={rate} onChange={(event) => setRate(event.target.value)} placeholder={`1 ${from.currency_code} → ${to.currency_code}`} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label>}
      <div className="flex items-end"><button disabled={pending} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{t("Record transfer")}</button></div>
    </form>
    {message && <p role="status" className="mt-3 text-sm text-slate-600">{t(message)}</p>}
    <div className="mt-5 flex justify-end"><SortControl label={text("정렬","Sort")} value={sortOrder} onChange={onSortChange} options={[
      { value: "date-desc", label: text("날짜 · 최신순", "Date · newest first") },
      { value: "date-asc", label: text("날짜 · 오래된 순", "Date · oldest first") },
      { value: "description", label: text("내용 · ㄱ-ㅎ / A-Z", "Description · A-Z") },
      { value: "amount-asc", label: text("보낸 금액 · 통화별 낮은 순", "Sent amount · low by currency") },
      { value: "amount-desc", label: text("보낸 금액 · 통화별 높은 순", "Sent amount · high by currency") },
    ]} /></div>
    <div className="mt-6 overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase text-slate-500"><tr><th className="pb-2">{t("Date")}</th><th className="pb-2">{t("Transfer")}</th><th className="pb-2 text-right">{t("From leg")}</th><th className="pb-2 text-right">{t("To leg")}</th></tr></thead><tbody>{data.transfers.map((transfer) => { const source = data.accounts.find((account) => account.id === transfer.from_account_id); const target = data.accounts.find((account) => account.id === transfer.to_account_id); const legs = transferLegs(transfer); return <tr key={transfer.id} className="border-b border-slate-100"><td className="py-3">{transfer.occurred_on}</td><td className="py-3">{transfer.description}<p className="text-xs text-slate-500">{source?.name} → {target?.name}</p></td><td className="py-3 text-right">{source ? formatMinor(legs[0].amountMinor, source.currency_code) : t("Account missing")}</td><td className="py-3 text-right">{target ? formatMinor(legs[1].amountMinor, target.currency_code) : t("Account missing")}</td></tr>; })}</tbody></table>{data.transfers.length === 0 && <p className="py-5 text-sm text-slate-500">{t("No transfers yet.")}</p>}</div>
  </section>;
}
