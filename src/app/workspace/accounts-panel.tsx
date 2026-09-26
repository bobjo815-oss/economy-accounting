"use client";

import { useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatMinor, parseSignedAmountToMinor, safeMinorNumber, supportedCurrencies, type CurrencyCode } from "@/lib/finance/money";
import type { AccountRow } from "@/lib/finance/records";

export default function AccountsPanel({ accounts, userId, supabase, refresh }: {
  accounts: AccountRow[]; userId: string; supabase: SupabaseClient; refresh: () => Promise<void>;
}) {
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
    const { error } = await supabase.from("accounts").insert({ user_id: userId, name: name.trim(), currency_code: currency, opening_balance_minor: safe });
    setPending(false);
    if (error) { setMessage("Could not add the account. Check that its name is unique."); return; }
    setName(""); setOpeningBalance("0"); setMessage("Account added.");
    await refresh();
  }

  return <section id="accounts" className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
    <h2 className="text-lg font-semibold">Accounts</h2>
    <p className="mt-1 text-sm text-slate-500">Balances stay in each account’s original currency.</p>
    <form onSubmit={submit} className="mt-5 grid gap-3 sm:grid-cols-[1fr_100px_130px_auto]">
      <label className="text-sm">Name<input required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
      <label className="text-sm">Currency<select value={currency} onChange={(event) => setCurrency(event.target.value as CurrencyCode)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-2 py-2">{supportedCurrencies.map((code) => <option key={code}>{code}</option>)}</select></label>
      <label className="text-sm">Opening balance<input required inputMode="decimal" value={openingBalance} onChange={(event) => setOpeningBalance(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
      <div className="flex items-end"><button disabled={pending} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Add</button></div>
    </form>
    {message && <p role="status" className="mt-2 text-sm text-slate-600">{message}</p>}
    <ul className="mt-5 divide-y divide-slate-100">{accounts.map((account) => <li key={account.id} className="flex justify-between gap-4 py-3 text-sm"><span>{account.name}</span><span className="font-medium">{formatMinor(BigInt(account.opening_balance_minor), account.currency_code)}</span></li>)}</ul>
    {accounts.length === 0 && <p className="mt-5 text-sm text-slate-500">Add an account to begin tracking cash.</p>}
  </section>;
}
