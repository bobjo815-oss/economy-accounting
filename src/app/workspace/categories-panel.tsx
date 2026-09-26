"use client";

import { useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CashDirection, CategoryRow } from "@/lib/finance/records";

export default function CategoriesPanel({ categories, userId, supabase, refresh }: {
  categories: CategoryRow[]; userId: string; supabase: SupabaseClient; refresh: () => Promise<void>;
}) {
  const [major, setMajor] = useState("");
  const [name, setName] = useState("");
  const [direction, setDirection] = useState<CashDirection>("outflow");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!major.trim() || !name.trim()) { setMessage("Enter a group and category name."); return; }
    setPending(true);
    const { error } = await supabase.from("categories").insert({ user_id: userId, major_name: major.trim(), name: name.trim(), normal_direction: direction });
    setPending(false);
    if (error) { setMessage("Could not add the category. Check whether it already exists."); return; }
    setName(""); setMessage("Category added.");
    await refresh();
  }

  return <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
    <h2 className="text-lg font-semibold">Categories</h2>
    <p className="mt-1 text-sm text-slate-500">You control the labels used for plans and payments.</p>
    <form onSubmit={submit} className="mt-5 grid gap-3 sm:grid-cols-[1fr_1fr_110px_auto]">
      <label className="text-sm">Group<input required value={major} onChange={(event) => setMajor(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
      <label className="text-sm">Category<input required value={name} onChange={(event) => setName(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
      <label className="text-sm">Direction<select value={direction} onChange={(event) => setDirection(event.target.value as CashDirection)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-2 py-2"><option value="outflow">Outflow</option><option value="inflow">Inflow</option></select></label>
      <div className="flex items-end"><button disabled={pending} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Add</button></div>
    </form>
    {message && <p role="status" className="mt-2 text-sm text-slate-600">{message}</p>}
    <ul className="mt-5 divide-y divide-slate-100">{categories.map((category) => <li key={category.id} className="flex justify-between gap-4 py-3 text-sm"><span>{category.major_name} / {category.name}</span><span className="text-slate-500">{category.normal_direction}</span></li>)}</ul>
    {categories.length === 0 && <p className="mt-5 text-sm text-slate-500">Add categories before classifying plans.</p>}
  </section>;
}
