"use client";
import { localDate } from "@/lib/finance/local-date";
import { useLanguage } from "@/lib/i18n/provider";

import { useState } from "react";
import Link from "next/link";
import type { WorkspaceData } from "@/lib/finance/records";
import { calendarEvents, reviewItems } from "@/lib/finance/workflow";

export default function ReviewCalendarPanel({ data, view }: { data: WorkspaceData; view: "review" | "calendar" }) {
  const { t } = useLanguage();
  const [month, setMonth] = useState(() => localDate(data.profile?.timezone).slice(0, 7));
  const today = localDate(data.profile?.timezone);
  const review = reviewItems(data, today);
  const events = calendarEvents(data, month, today);
  const first = new Date(`${month}-01T00:00:00Z`);
  const dayCount = Number.isNaN(first.getTime()) ? 0 : new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const offset = Number.isNaN(first.getTime()) ? 0 : (first.getUTCDay() + 6) % 7;
  return <div>
    {view === "review" && <section id="review" className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200"><h2 className="text-lg font-semibold">{t("Review queue")}</h2><p className="mt-1 text-sm text-slate-500">{t("Items needing your decision; nothing changes automatically.")}</p><ul className="mt-4 max-h-96 divide-y divide-slate-100 overflow-auto">{review.map((item) => <li key={item.id} className="flex justify-between gap-4 py-3 text-sm"><span><span className="font-medium">{t(item.reason)}</span><br />{item.date} · {item.title}</span><Link href={item.href} className="shrink-0 underline">{t("Review")}</Link></li>)}</ul>{review.length === 0 && <p className="mt-4 text-sm text-slate-500">{t("No items to review.")}</p>}</section>}
    {view === "calendar" && <section id="calendar" className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">{t("Plan calendar")}</h2><label className="text-sm">{t("Month")}{" "}<input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="rounded-lg border border-slate-300 px-2 py-1" /></label></div><div className="mt-4 grid grid-cols-7 gap-1 text-center text-xs text-slate-500">{[t("Mon"), t("Tue"), t("Wed"), t("Thu"), t("Fri"), t("Sat"), t("Sun")].map((day) => <span key={t(day)}>{t(day)}</span>)}</div><div className="mt-1 grid grid-cols-7 gap-1">{Array.from({ length: offset }, (_, index) => <span key={`blank-${index}`} />)}{Array.from({ length: dayCount }, (_, index) => { const date = `${month}-${String(index + 1).padStart(2, "0")}`; const count = events.filter((event) => event.date === date).length; return <div key={date} className={`min-h-12 rounded-lg border p-1 text-xs ${date === today ? "border-slate-700" : "border-slate-200"}`}><span>{index + 1}</span>{count > 0 && <p className="mt-1 rounded bg-slate-100 px-1">{count}{" "}{t("event")}</p>}</div>; })}</div><ol className="mt-4 max-h-64 divide-y divide-slate-100 overflow-auto">{events.map((event) => <li key={event.id} className="py-2 text-sm"><span className="font-medium">{event.date} · {t(event.kind)}</span> · {event.title} <span className="text-slate-500">({t(event.state)})</span></li>)}</ol>{events.length === 0 && <p className="mt-4 text-sm text-slate-500">{t("No plans or settlements this month.")}</p>}</section>}
  </div>;
}
