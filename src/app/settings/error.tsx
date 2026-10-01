"use client";
import { useLanguage } from "@/lib/i18n/provider";
export default function SettingsError() {
  const { locale } = useLanguage();
  return <main className="min-h-screen bg-slate-50 p-8 text-slate-950"><h1 className="text-2xl font-semibold">{locale === "ko" ? "설정을 불러오지 못했습니다" : "Could not load settings"}</h1>
    <a href="/settings" className="mt-6 inline-block underline">{locale === "ko" ? "다시 시도" : "Try again"}</a></main>;
}
