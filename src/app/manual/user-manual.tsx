"use client";

import Link from "next/link";
import { userGuide, userGuideSections } from "@/lib/finance/user-guide";
import { workspaceHref, type WorkspaceSection } from "@/lib/finance/navigation";
import { useLanguage } from "@/lib/i18n/provider";
import { NavIcon, WorkspaceNav } from "../workspace/navigation-ui";

export default function UserManual({ context, showAll }: { context: string; showAll: boolean }) {
  const { locale } = useLanguage();
  const ko = locale === "ko";
  const sections = showAll ? userGuideSections : [context];

  return <main className="min-h-screen bg-slate-50 text-slate-950"><div className="mx-auto grid w-full max-w-[1800px] gap-7 px-6 py-6 lg:grid-cols-[230px_minmax(0,1fr)] xl:px-10">
    <WorkspaceNav section="manual" />
    <div className="min-w-0 space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-6"><div><p className="mb-2 text-xs font-semibold uppercase tracking-widest text-teal-700">Study Finance</p><h1 className="flex items-center gap-3 text-3xl font-semibold tracking-tight"><NavIcon name="manual" />{ko ? "사용설명서" : "User guide"}</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">{ko ? "각 화면의 기능과 입력 방법을 확인하세요. 사용설명서를 열면 현재 페이지 안내가 먼저 표시됩니다." : "Learn what each page does and how to use it. Opening the guide shows help for your current page first."}</p></div>
        {!showAll && <Link href="/manual?view=all" className="rounded-lg border border-teal-700 bg-white px-4 py-2 text-sm font-medium text-teal-900 hover:bg-teal-50">{ko ? "전체 메뉴 안내 보기" : "View all sections"}</Link>}
      </header>
      <div className="space-y-5">
        {sections.map((section) => {
          const guide = userGuide[section];
          if (!guide) return null;
          const destination = section === "settings" ? "/settings" : section === "overview" ? "/workspace" : workspaceHref(section as WorkspaceSection);
          return <section key={section} className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-xl font-semibold">{guide.title[ko ? 0 : 1]}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{guide.summary[ko ? 0 : 1]}</p></div><Link href={destination} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800">{ko ? "이 페이지 열기" : "Open this page"} →</Link></div>
            <ol className="mt-5 space-y-3">{guide.steps.map(([koText, enText], index) => <li key={index} className="flex gap-3 rounded-xl bg-slate-50 p-4 text-sm leading-6"><span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-teal-100 font-semibold text-teal-900">{index + 1}</span><span>{ko ? koText : enText}</span></li>)}</ol>
          </section>;
        })}
      </div>
      {!showAll && <Link href="/manual?view=all" className="inline-flex items-center gap-2 text-sm font-medium text-teal-900 underline">{ko ? "전체 메뉴와 설정 안내도 보기" : "See all pages and settings"}</Link>}
    </div>
  </div></main>;
}
