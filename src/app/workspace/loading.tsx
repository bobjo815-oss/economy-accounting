"use client";
import { useLanguage } from "@/lib/i18n/provider";
export default function WorkspaceLoading() {
  const { t } = useLanguage();
  return <main className="min-h-screen bg-slate-50 p-8 text-slate-950">
    <h1 className="text-2xl font-semibold">Study Finance</h1>
    <p role="status" className="mt-4">{t("워크스페이스를 불러오는 중입니다…")}</p>
  </main>;
}
