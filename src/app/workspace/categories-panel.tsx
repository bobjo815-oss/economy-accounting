"use client";
import { useLanguage } from "@/lib/i18n/provider";

import { useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CashDirection, CategoryRow } from "@/lib/finance/records";
import SortControl from "./sort-control";

export default function CategoriesPanel({ categories, userId, supabase, refresh, sortOrder, onSortChange }: {
  categories: CategoryRow[]; userId: string; supabase: SupabaseClient; refresh: () => Promise<void>; sortOrder: string; onSortChange: (value: string) => void;
}) {
  const { t, locale } = useLanguage();
  const text = (ko: string,en: string) => locale === "ko" ? ko : en;
  const [editing,setEditing] = useState<CategoryRow | null>(null);
  const [major, setMajor] = useState("");
  const [name, setName] = useState("");
  const [direction, setDirection] = useState<CashDirection>("outflow");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!major.trim() || !name.trim()) { setMessage("Enter a group and category name."); return; }
    setPending(true);
    const result = editing ? await supabase.from("categories").update({ major_name: major.trim(),name: name.trim() }).eq("user_id",userId).eq("id",editing.id).eq("name",editing.name).eq("major_name",editing.major_name).select("id") : await supabase.from("categories").insert({ user_id: userId, major_name: major.trim(), name: name.trim(), normal_direction: direction }).select("id");
    setPending(false);
    if (result.error || !result.data?.length) { setMessage(text("저장하지 못했습니다. 중복이나 다른 화면의 변경을 확인하세요.","Not saved. Check duplicates or concurrent changes.")); return; }
    setEditing(null); setName(""); setMessage(text("분류를 저장했습니다.","Category saved."));
    await refresh();
  }
  async function toggle(category: CategoryRow) {
    setPending(true);
    const result = await supabase.from("categories").update({ is_active: !category.is_active }).eq("user_id",userId).eq("id",category.id).eq("is_active",category.is_active).select("id");
    setPending(false);
    if (result.error || !result.data?.length) setMessage(text("변경하지 못했습니다. 다시 불러오세요.","Not changed. Reload.")); else await refresh();
  }

  return <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
    <h2 className="text-lg font-semibold">{t("Categories")}</h2>
    <p className="mt-1 text-sm text-slate-500">{t("You control the labels used for plans and payments.")}</p>
    {editing && <p className="mt-3 text-sm text-amber-800">{text("분류명을 바꾸면 기존 기록에도 새 이름이 표시됩니다. 수입·지출 방향은 기존 기록을 보호하기 위해 고정됩니다. 다른 방향은 새 분류로 만드세요.","Renaming updates labels on existing records. Direction remains fixed to protect history; create another category for a different direction.")}</p>}
    <form onSubmit={submit} className="mt-5 grid gap-3 sm:grid-cols-[1fr_1fr_110px_auto]">
      <label className="text-sm">{t("Group")}<input required value={major} onChange={(event) => setMajor(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
      <label className="text-sm">{t("Category")}<input required value={name} onChange={(event) => setName(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
      <label className="text-sm">{t("Direction")}<select disabled={Boolean(editing)} value={direction} onChange={(event) => setDirection(event.target.value as CashDirection)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-2 py-2"><option value="inflow">{t("Inflow")}</option><option value="outflow">{t("Outflow")}</option></select></label>
      <div className="flex items-end"><button disabled={pending} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{editing ? text("수정 저장","Save changes") : t("Add")}</button>{editing && <button type="button" onClick={() => { setEditing(null); setName(""); }} className="ml-3 underline">{text("취소","Cancel")}</button>}</div>
    </form>
    {message && <p role="status" className="mt-2 text-sm text-slate-600">{t(message)}</p>}
    <div className="mt-4 flex justify-end"><SortControl label={text("정렬","Sort")} value={sortOrder} onChange={onSortChange} options={[
      { value: "name", label: text("이름 · ㄱ-ㅎ / A-Z", "Category · A-Z") },
      { value: "group", label: text("그룹 · ㄱ-ㅎ / A-Z", "Group · A-Z") },
      { value: "direction", label: text("수입 / 지출", "Income / expense") },
    ]} /></div>
    <div className="mt-5 space-y-6">{(["inflow", "outflow"] as const).map((cashDirection) => {
      const rows = categories.filter((category) => category.normal_direction === cashDirection);
      if (rows.length === 0) return null;
      return <section key={cashDirection} aria-labelledby={`categories-${cashDirection}`}><h3 id={`categories-${cashDirection}`} className="border-b pb-2 font-semibold">{t(cashDirection)}</h3><ul className="divide-y divide-slate-100">{rows.map((category) => <li key={category.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><span>{category.major_name} / {category.name}{!category.is_active && <span className="ml-2 text-slate-500">{text("사용 중지","Inactive")}</span>}</span><div className="flex gap-3"><button type="button" disabled={pending || editing !== null} onClick={() => { setEditing(category); setMajor(category.major_name); setName(category.name); setDirection(category.normal_direction); }} className="underline">{text("수정","Edit")}</button><button type="button" disabled={pending || editing !== null} onClick={() => void toggle(category)} className="underline">{category.is_active ? text("사용 중지","Deactivate") : text("복원","Restore")}</button></div></li>)}</ul></section>;
    })}</div>
    {categories.length === 0 && <p className="mt-5 text-sm text-slate-500">{t("Add categories before classifying plans.")}</p>}
  </section>;
}
