"use client";

import { startTransition, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { loadWorkspace } from "@/lib/finance/workspace-data";
import type { WorkspaceData } from "@/lib/finance/records";
import AccountsPanel from "./accounts-panel";
import CategoriesPanel from "./categories-panel";
import PlansPanel from "./plans-panel";
import ActualsPanel from "./actuals-panel";
import TransfersPanel from "./transfers-panel";
import RecurringPanel from "./recurring-panel";
import ReportsPanel from "./reports-panel";
import ReviewCalendarPanel from "./review-calendar-panel";

export default function Workspace({ userId }: { userId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [message, setMessage] = useState("");
  const router = useRouter();

  const refresh = useCallback(async () => {
    try {
      setData(await loadWorkspace(supabase, userId));
      setMessage("");
    } catch {
      setMessage("The finance workspace could not load. Check the database setup and your connection.");
    }
  }, [supabase, userId]);

  useEffect(() => { startTransition(() => { void refresh(); }); }, [refresh]);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  if (!data) return <main className="mx-auto max-w-5xl p-6 text-slate-900"><h1 className="text-2xl font-semibold">Study Finance</h1><p role="status" className="mt-4">{message || "Loading your workspace…"}</p></main>;

  return <main className="min-h-screen bg-slate-50 text-slate-950">
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-sm text-slate-500">Private finance workspace</p><h1 className="text-3xl font-semibold">Study Finance</h1></div><button type="button" onClick={signOut} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm">Sign out</button></header>
      <nav aria-label="Workspace sections" className="flex flex-wrap gap-2 text-sm"><a href="#overview" className="rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200">Overview</a><a href="#review" className="rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200">Review</a><a href="#calendar" className="rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200">Calendar</a><a href="#accounts" className="rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200">Accounts</a><a href="#plans" className="rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200">Plans</a><a href="#actuals" className="rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200">Actuals</a><a href="#transfers" className="rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200">Transfers</a><a href="#recurring" className="rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200">Recurring</a></nav>
      <ReportsPanel data={data} userId={userId} supabase={supabase} refresh={refresh} />
      <ReviewCalendarPanel data={data} />
      <div className="grid gap-6 lg:grid-cols-2"><AccountsPanel accounts={data.accounts} userId={userId} supabase={supabase} refresh={refresh} /><CategoriesPanel categories={data.categories} userId={userId} supabase={supabase} refresh={refresh} /></div>
      <PlansPanel data={data} userId={userId} supabase={supabase} refresh={refresh} />
      <ActualsPanel data={data} userId={userId} supabase={supabase} refresh={refresh} />
      <TransfersPanel data={data} userId={userId} supabase={supabase} refresh={refresh} />
      <RecurringPanel data={data} userId={userId} supabase={supabase} refresh={refresh} />
    </div>
  </main>;
}
