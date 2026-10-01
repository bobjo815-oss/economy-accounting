"use client";
import { useLanguage } from "@/lib/i18n/provider";

import { startTransition, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { loadWorkspace } from "@/lib/finance/workspace-data";
import type { WorkspaceData } from "@/lib/finance/records";
import AccountsPanel from "./accounts-panel";
import CategoriesPanel from "./categories-panel";
import PlansPanel from "./plans-panel";
import ActualsPanel from "./actuals-panel";
import TransactionDraftsPanel from "./transaction-drafts-panel";
import TransfersPanel from "./transfers-panel";
import RecurringPanel from "./recurring-panel";
import ReportsPanel from "./reports-panel";
import ReviewCalendarPanel from "./review-calendar-panel";
import { workspacePages, workspaceHref, type WorkspaceSection } from "@/lib/finance/navigation";
import { HelpTip, NavIcon, WorkspaceNav } from "./navigation-ui";
import { sortWorkspaceLists, type WorkspaceSortOrders } from "@/lib/finance/sorting";
import { starterCategories } from "@/lib/finance/starter-categories";
import FirstUseGuide from "./first-use-guide";

export default function Workspace({ userId, section = "overview" }: { userId: string; section?: WorkspaceSection }) {
  const { t, locale } = useLanguage();
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [sortOrders, setSortOrders] = useState<WorkspaceSortOrders & { reports: string }>({
    actuals: "date-desc", plans: "date-asc", accounts: "name", categories: "name", recurring: "date-asc", transfers: "date-desc", reports: "category",
  });
  const page = workspacePages.find((item) => item.id === section)!;
  const text = (ko: string, en: string) => locale === "ko" ? ko : en;
  const changeSort = (key: string, value: string) => setSortOrders((current) => ({ ...current, [key]: value }));
  const displayedData = useMemo(() => data ? sortWorkspaceLists(data, sortOrders, locale) : null, [data, locale, sortOrders]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const loaded = await loadWorkspace(supabase, userId);
      if (loaded.categories.length === 0) {
        const seeded = await supabase.from("categories").upsert(starterCategories(userId, locale), {
          onConflict: "user_id,major_name,name", ignoreDuplicates: true,
        });
        if (seeded.error) {
          setData(loaded);
          setMessage(locale === "ko" ? "기본 분류를 추가하지 못했습니다. ‘수입·지출 분류’에서 직접 추가할 수 있어요." : "Starter categories could not be added. You can add them under Categories.");
          return;
        }
        setData(await loadWorkspace(supabase, userId));
      } else setData(loaded);
      setMessage("");
    } catch {
      setMessage("데이터를 불러오지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  }, [supabase, userId, locale]);

  useEffect(() => { startTransition(() => { void refresh(); }); }, [refresh]);

  async function signOut() {
    setSigningOut(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      window.location.replace("/login");
    } catch {
      setMessage(text("로그아웃하지 못했습니다. 다시 시도해 주세요.", "Could not sign out. Please try again."));
      setSigningOut(false);
    }
  }

  if (!data) return <main className="min-h-screen bg-slate-50 px-6 py-12 text-slate-950">
    <section className="mx-auto max-w-xl rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200" aria-busy={loading}>
      <h1 className="text-2xl font-semibold">Study Finance</h1>
      <p role="status" className="mt-4 text-slate-700">{t(message || "워크스페이스를 불러오는 중입니다…")}</p>
      {!loading && <div className="mt-6 flex gap-3">
        <button type="button" onClick={() => void refresh()} className="rounded-lg bg-slate-900 px-4 py-2 text-white">{t("다시 시도")}</button>
        <button type="button" onClick={() => void signOut()} className="rounded-lg border border-slate-300 px-4 py-2">{t("로그아웃")}</button>
      </div>}
    </section>
  </main>;

  return <main className="min-h-screen bg-slate-50 text-slate-950">
    <FirstUseGuide userId={userId} />
    <a href="#page-content" className="sr-only focus:not-sr-only focus:block focus:p-3">{text("본문으로 건너뛰기", "Skip to content")}</a>
    <div className="mx-auto grid w-full max-w-[1800px] gap-7 px-6 py-6 lg:grid-cols-[230px_minmax(0,1fr)] xl:px-10">
      <WorkspaceNav section={section} />
      <div id="page-content" className="min-w-0 space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-6"><div><p className="mb-2 text-xs font-semibold uppercase tracking-widest text-teal-700">Study Finance</p><h1 className="text-3xl font-semibold tracking-tight">{page[locale]}</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">{locale === "ko" ? page.descriptionKo : page.descriptionEn}</p></div><button type="button" disabled={signingOut} onClick={() => void signOut()} className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm disabled:opacity-50"><NavIcon name="logout" />{signingOut ? text("로그아웃 중…", "Signing out…") : t("Sign out")}</button></header>
      {message && <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950">
        <p>{t(message)}{t("화면에는 마지막으로 불러온 데이터가 표시됩니다.")}</p>
        <button type="button" disabled={loading} onClick={() => void refresh()} className="mt-2 underline disabled:opacity-50">{loading ? t("불러오는 중…") : t("다시 시도")}</button>
      </div>}
      {section === "overview" && data.accounts.length === 0 && <section className="rounded-xl border border-teal-200 bg-teal-50 p-5 text-slate-950">
        <h2 className="font-semibold">{t("첫 계좌를 추가해 시작하세요")}</h2>
        <p className="mt-2 text-sm">{t("아직 등록된 계좌가 없습니다. 계좌와 통화, 시작 잔액을 입력한 뒤 지출 계획과 실제 결제를 기록할 수 있습니다.")}</p>
        <Link href="/workspace/accounts" className="mt-3 inline-block rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white">{t("계좌 추가로 이동")}</Link>
      </section>}
      {section === "overview" && <div className="grid gap-3 sm:grid-cols-2">{(["actuals", "plans"] as const).map((id) => <Link key={id} href={workspaceHref(id)} className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-5 hover:border-teal-400"><span className="rounded-lg bg-teal-50 p-3 text-teal-800"><NavIcon name={id} /></span><div><p className="font-semibold">{id === "actuals" ? text("수입·지출 기록하기", "Record a transaction") : text("수입·지출 계획하기", "Plan income or spending")}</p><p className="mt-1 text-sm text-slate-500">{id === "actuals" ? text("이미 받거나 쓴 돈", "Money already received or spent") : text("앞으로 받거나 낼 돈", "Money you expect to receive or pay")}</p></div><span aria-hidden="true" className="ml-auto">→</span></Link>)}</div>}
      {(["plans", "actuals", "accounts", "reports", "recurring"] as string[]).includes(section) && <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm"><span>{text("처음 사용하는 용어가 있나요? 오른쪽 도움말을 열어보세요.", "Not sure about a term? Open the quick explanation.")}</span><HelpTip label={text("용어 도움말", "Explain these terms")}>
        {section === "plans" ? text("최초 예상은 처음 세운 계획입니다. 현재 예상은 환율 등을 반영한 최신 예상입니다. 아직 실제 거래로 기록되지는 않습니다.", "Original estimate keeps your first plan. Latest estimate reflects revised exchange rates and fees. Neither records an actual transaction.") : section === "actuals" ? text("거래 금액은 원래 통화로 표시된 금액입니다. 계좌 반영 금액은 명세서에 찍힌 최종 금액입니다. 그 금액에 포함된 수수료는 다시 더하지 마세요.", "Transaction amount is the charge in its original currency. Account amount is the final amount on your statement. Do not add an included fee twice.") : section === "transfers" ? text("내 계좌 간 이동은 새로운 수입이나 지출이 아닙니다. 별도로 낸 이체 수수료만 지출로 계산합니다.", "Moving money between your own accounts is not new income or spending. Only a separately charged fee is an expense.") : section === "accounts" ? text("시작 잔액은 이 앱에 첫 거래를 기록하기 직전의 잔액입니다. 이후 거래는 이 잔액에 더하거나 뺍니다.", "Opening balance is the balance just before your first recorded transaction. Later transactions add to or subtract from it.") : section === "reports" ? text("차이는 실제 지출에서 예상 지출을 뺀 값입니다. 양수면 예상보다 더 썼다는 뜻입니다. 지출 비율은 실제 지출 ÷ 예상 지출입니다.", "Difference is actual spending minus planned spending. Positive means you spent more than planned. Budget used is actual spending divided by planned spending.") : text("정기 항목은 다음 계획의 양식입니다. 직접 확인해 추가하기 전에는 계획도 결제 내역도 생성하지 않습니다.", "A recurring item is a template. It creates neither a plan nor a payment until you confirm the proposed plan.")}
      </HelpTip></div>}
      {(section === "overview" || section === "reports" || section === "export") && <ReportsPanel view={section} data={displayedData!} sortOrder={sortOrders.reports} onSortChange={(value) => changeSort("reports",value)} />}
      {(section === "review" || section === "calendar") && <ReviewCalendarPanel view={section} data={displayedData!} />}
      {section === "accounts" && <AccountsPanel accounts={displayedData!.accounts} sortOrder={sortOrders.accounts} onSortChange={(value) => changeSort("accounts",value)} userId={userId} supabase={supabase} refresh={refresh} />}
      {section === "categories" && <CategoriesPanel categories={displayedData!.categories} sortOrder={sortOrders.categories} onSortChange={(value) => changeSort("categories",value)} userId={userId} supabase={supabase} refresh={refresh} />}
      {section === "plans" && <PlansPanel data={displayedData!} sortOrder={sortOrders.plans} onSortChange={(value) => changeSort("plans",value)} userId={userId} supabase={supabase} refresh={refresh} />}
      {section === "actuals" && <><details className="rounded-xl border border-teal-200 bg-white p-4"><summary className="cursor-pointer font-medium text-teal-800">{text("가져온 자료 검토 · 명세서와 영수증 대조", "Review imports · compare statements and receipts")}</summary><div className="mt-4"><TransactionDraftsPanel data={displayedData!} revision={data.actuals.length} userId={userId} supabase={supabase} blocked={false} refresh={refresh} /></div></details><ActualsPanel data={displayedData!} sortOrder={sortOrders.actuals} onSortChange={(value) => changeSort("actuals",value)} userId={userId} supabase={supabase} refresh={refresh} /></>}
      {section === "drafts" && <TransactionDraftsPanel data={displayedData!} revision={data.actuals.length} userId={userId} supabase={supabase} blocked={false} refresh={refresh} />}
      {section === "transfers" && <TransfersPanel data={displayedData!} sortOrder={sortOrders.transfers} onSortChange={(value) => changeSort("transfers",value)} userId={userId} supabase={supabase} refresh={refresh} />}
      {section === "recurring" && <RecurringPanel data={displayedData!} sortOrder={sortOrders.recurring} onSortChange={(value) => changeSort("recurring",value)} userId={userId} supabase={supabase} refresh={refresh} />}
      </div>
    </div>
  </main>;
}
