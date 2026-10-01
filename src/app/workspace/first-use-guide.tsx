"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { userGuide, userGuideSections } from "@/lib/finance/user-guide";
import { workspaceHref, type WorkspaceSection } from "@/lib/finance/navigation";
import { useLanguage } from "@/lib/i18n/provider";

export function firstUseGuideKey(userId: string) {
  return `study-finance-first-use-guide:${userId}`;
}

export default function FirstUseGuide({ userId }: { userId: string }) {
  const { locale } = useLanguage();
  const [open, setOpen] = useState(false);
  const ko = locale === "ko";

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (window.localStorage.getItem(firstUseGuideKey(userId)) !== "done") setOpen(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [userId]);

  function close() {
    window.localStorage.setItem(firstUseGuideKey(userId), "done");
    setOpen(false);
  }

  if (!open) return null;
  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="first-use-guide-title" className="flex max-h-[88vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-2xl">
      <header className="border-b border-slate-200 p-6"><p className="text-xs font-semibold uppercase tracking-wide text-teal-700">{ko ? "처음 오셨나요?" : "Welcome"}</p><h2 id="first-use-guide-title" className="mt-2 text-2xl font-semibold">{ko ? "Study Finance 사용 안내" : "Your Study Finance guide"}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{ko ? "각 메뉴에서 무엇을 할 수 있는지 빠르게 살펴보세요. 이 안내는 거래를 만들거나 바꾸지 않습니다." : "See what each section does. This guide never creates or changes financial records."}</p></header>
      <div className="min-h-0 space-y-5 overflow-y-auto p-6">
        <div className="grid gap-3 sm:grid-cols-2">
          {userGuideSections.filter((section) => section !== "settings").map((section) => {
            const guide = userGuide[section];
            return <Link key={section} href={section === "overview" ? "/workspace" : workspaceHref(section as WorkspaceSection)} onClick={close} className="rounded-xl border border-slate-200 p-4 hover:border-teal-400 hover:bg-teal-50">
              <h3 className="font-semibold">{guide.title[ko ? 0 : 1]}</h3><p className="mt-1 text-sm leading-5 text-slate-600">{guide.summary[ko ? 0 : 1]}</p>
            </Link>;
          })}
          <Link href="/settings" onClick={close} className="rounded-xl border border-slate-200 p-4 hover:border-teal-400 hover:bg-teal-50"><h3 className="font-semibold">{userGuide.settings.title[ko ? 0 : 1]}</h3><p className="mt-1 text-sm leading-5 text-slate-600">{userGuide.settings.summary[ko ? 0 : 1]}</p></Link>
        </div>
        <p className="rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-700">{ko ? "기본 흐름: 계좌 설정 → 계획 또는 실제 거래 입력 → 분류 확인 → 달력·분석에서 검토. 자세한 버튼별 안내는 왼쪽 아래 사용설명서에서 현재 페이지 기준으로 볼 수 있어요." : "A useful flow: set up accounts → enter plans or actual transactions → review categories → check the calendar and reports. Open User guide at the bottom of the sidebar for detailed help on the current page."}</p>
      </div>
      <footer className="flex justify-end border-t border-slate-200 p-5"><button type="button" onClick={close} className="rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-medium text-white">{ko ? "시작하기" : "Get started"}</button></footer>
    </section>
  </div>;
}
