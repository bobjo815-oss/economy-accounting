"use client";

import { useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatMinor, parseAmountToMinor, parseRate, safeMinorNumber } from "@/lib/finance/money";
import { transferLegs } from "@/lib/finance/transfer";
import type { WorkspaceData } from "@/lib/finance/records";

export default function TransfersPanel({ data, userId, supabase, refresh }: {
  data: WorkspaceData; userId: string; supabase: SupabaseClient; refresh: () => Promise<void>;
}) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
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
    <h2 className="text-lg font-semibold">Transfers</h2>
    <p className="mt-1 text-sm text-slate-500">Moving money between your accounts creates two balance changes. Only a separately charged fee is spending.</p>
    <form onSubmit={submit} className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="text-sm lg:col-span-2">Description<input required maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
      <label className="text-sm">Date<input required type="date" value={date} onChange={(event) => setDate(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
      <div />
      <label className="text-sm">From account<select required value={fromId} onChange={(event) => setFromId(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="">Choose account</option>{data.accounts.filter((account) => account.is_active).map((account) => <option key={account.id} value={account.id}>{account.name} ({account.currency_code})</option>)}</select></label>
      <label className="text-sm">To account<select required value={toId} onChange={(event) => setToId(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="">Choose account</option>{data.accounts.filter((account) => account.is_active).map((account) => <option key={account.id} value={account.id}>{account.name} ({account.currency_code})</option>)}</select></label>
      <label className="text-sm">Sent principal {from ? `(${from.currency_code})` : ""}<input required inputMode="decimal" value={sent} onChange={(event) => setSent(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
      <label className="text-sm">Received principal {to ? `(${to.currency_code})` : ""}<input required inputMode="decimal" value={received} onChange={(event) => setReceived(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
      <label className="text-sm">Separate fee {from ? `(${from.currency_code})` : ""}<input inputMode="decimal" value={fee} onChange={(event) => setFee(event.target.value)} placeholder="0" className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
      {from && to && from.currency_code !== to.currency_code && <label className="text-sm">Observed FX rate, if known<input inputMode="decimal" value={rate} onChange={(event) => setRate(event.target.value)} placeholder={`1 ${from.currency_code} in ${to.currency_code}`} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label>}
      <div className="flex items-end"><button disabled={pending} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Record transfer</button></div>
    </form>
    {message && <p role="status" className="mt-3 text-sm text-slate-600">{message}</p>}
    <div className="mt-6 overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase text-slate-500"><tr><th className="pb-2">Date</th><th className="pb-2">Transfer</th><th className="pb-2 text-right">From leg</th><th className="pb-2 text-right">To leg</th></tr></thead><tbody>{data.transfers.map((transfer) => { const source = data.accounts.find((account) => account.id === transfer.from_account_id); const target = data.accounts.find((account) => account.id === transfer.to_account_id); const legs = transferLegs(transfer); return <tr key={transfer.id} className="border-b border-slate-100"><td className="py-3">{transfer.occurred_on}</td><td className="py-3">{transfer.description}<p className="text-xs text-slate-500">{source?.name} → {target?.name}</p></td><td className="py-3 text-right">{source ? formatMinor(legs[0].amountMinor, source.currency_code) : "Account missing"}</td><td className="py-3 text-right">{target ? formatMinor(legs[1].amountMinor, target.currency_code) : "Account missing"}</td></tr>; })}</tbody></table>{data.transfers.length === 0 && <p className="py-5 text-sm text-slate-500">No transfers yet.</p>}</div>
  </section>;
}
