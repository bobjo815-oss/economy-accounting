"use client";
import { useLanguage } from "@/lib/i18n/provider";

export default function WorkspaceError() {
  const { t } = useLanguage();
  return <main className="min-h-screen bg-slate-50 p-8 text-slate-950">
    <h1 className="text-2xl font-semibold">{t("워크스페이스를 열지 못했습니다")}</h1>
    <p role="alert" className="mt-4">{t("잠시 후 다시 시도해 주세요.")}</p>
    <button type="button" onClick={() => window.location.reload()} className="mt-6 inline-block rounded-lg bg-slate-900 px-4 py-2 text-white">{t("다시 시도")}</button>
    <a href="/login" className="ml-4 underline">{t("로그인 화면으로")}</a>
  </main>;
}
