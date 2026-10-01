"use client";
import Link from "next/link";
import { useId, useState } from "react";
import { useLanguage } from "@/lib/i18n/provider";
import { workspaceHref, workspacePages, type WorkspaceSection } from "@/lib/finance/navigation";

const paths: Record<string, string> = {
  overview: "M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9",
  actuals: "M6 3h12v18l-3-2-3 2-3-2-3 2V3Zm3 5h6m-6 4h6",
  plans: "M4 5h16v16H4zM8 3v4m8-4v4M4 10h16m-12 5 2 2 5-4",
  transfers: "M3 7h17m-4-4 4 4-4 4M21 17H4m4-4-4 4 4 4",
  calendar: "M4 5h16v16H4zM8 3v4m8-4v4M4 10h16m-12 4h2m4 0h2m-8 4h2",
  review: "M12 3 2 21h20L12 3Zm0 6v5m0 3v1",
  reports: "M4 3v18h17M8 17v-5m5 5V7m5 10V4",
  accounts: "M3 7h18v14H3zM3 7V4h15v3m-2 6h5v4h-5z",
  categories: "M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z",
  recurring: "M4 10a8 8 0 0 1 14-5l3 3M21 3v5h-5M20 14a8 8 0 0 1-14 5l-3-3m0 5v-5h5",
  export: "M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5",
  settings: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2",
  manual: "M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Zm0 0V21m4-14h8m-8 4h8",
  logout: "M10 4H4v16h6m4-12 4 4-4 4m-6-4h12",
};
export function NavIcon({ name }: { name: string }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="size-5 shrink-0"><path d={paths[name] ?? paths.overview} /></svg>;
}
export function WorkspaceNav({ section }: { section: WorkspaceSection | "settings" | "manual" }) {
  const { locale } = useLanguage();
  const groups = [{ id: "overview", ko: "한눈에 보기", en: "Overview" }, { id: "record", ko: "기록하기", en: "Record" }, { id: "track", ko: "살펴보기", en: "Track" }, { id: "manage", ko: "관리하기", en: "Manage" }];
  return <aside className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 lg:sticky lg:top-5 lg:max-h-[calc(100vh-40px)] lg:min-h-[calc(100vh-40px)] lg:self-start lg:overflow-y-auto">
    <Link href="/workspace" className="mb-5 flex items-center gap-3 px-2 py-2 font-semibold"><span className="rounded-xl bg-teal-700 p-2 text-white"><NavIcon name="accounts" /></span>Study Finance</Link>
    <nav aria-label={locale === "ko" ? "주 메뉴" : "Main navigation"} className="space-y-5">
      {groups.map((group) => <div key={group.id}><p className="mb-2 px-3 text-xs font-semibold tracking-wide text-slate-500">{group[locale]}</p><div className="flex flex-wrap gap-1 lg:block lg:space-y-1">{workspacePages.filter((page) => page.group === group.id && (!('navigation' in page) || page.navigation !== false)).map((page) => <Link key={page.id} href={workspaceHref(page.id)} aria-current={section === page.id ? "page" : undefined} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${section === page.id ? "bg-teal-50 text-teal-900 ring-1 ring-teal-200" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"}`}><NavIcon name={page.id} />{page[locale]}</Link>)}</div></div>)}
    </nav>
    <div className="mt-auto border-t border-slate-200 pt-3">
      <Link href={section === "manual" ? "/manual?view=all" : `/manual?context=${section}`} aria-current={section === "manual" ? "page" : undefined} className={`mb-1 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${section === "manual" ? "bg-teal-50 text-teal-900" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"}`}><NavIcon name="manual" />{locale === "ko" ? "사용설명서" : "User guide"}</Link>
      <Link href="/settings" aria-current={section === "settings" ? "page" : undefined} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${section === "settings" ? "bg-teal-50 text-teal-900" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"}`}><NavIcon name="settings" />{locale === "ko" ? "설정" : "Settings"}</Link>
    </div>
  </aside>;
}
export function HelpTip({ label, children }: { label: string; children: React.ReactNode }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return <span className="relative inline-flex" onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}>
    <button type="button" aria-label={label} aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)} onBlur={() => setOpen(false)} className="inline-flex size-7 items-center justify-center rounded-full border border-slate-300 bg-white text-sm font-semibold text-slate-600 hover:bg-teal-50">?</button>
    {open && <span id={id} role="note" className="absolute right-0 top-9 z-20 w-72 rounded-xl border border-slate-200 bg-slate-900 p-4 text-left text-sm font-normal leading-6 text-white shadow-lg">{children}</span>}
  </span>;
}
