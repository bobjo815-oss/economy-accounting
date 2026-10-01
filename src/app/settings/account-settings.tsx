"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/lib/i18n/provider";
import { createClient } from "@/lib/supabase/client";
import { supportedCurrencies, type CurrencyCode } from "@/lib/finance/money";
import { parseProfileSettings } from "@/lib/finance/profile-settings";
import { recoveryRequestRedirect } from "@/lib/auth/recovery-redirect";
import type { ProfileRow } from "@/lib/finance/records";
import { WorkspaceNav } from "../workspace/navigation-ui";
import { walkthroughKey } from "../workspace/transaction-walkthrough";

export default function AccountSettings({ userId, email, providers, profile }: {
  userId: string; email: string; providers: string[]; profile: ProfileRow | null;
}) {
  const { locale, setLocale } = useLanguage();
  const text = (ko: string, en: string) => locale === "ko" ? ko : en;
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [currency, setCurrency] = useState<CurrencyCode>(profile?.base_currency ?? "KRW");
  const [safety, setSafety] = useState(String((profile?.safety_balance_minor ?? 0) / (profile?.base_currency === "GBP" || profile?.base_currency === "USD" ? 100 : 1)));
  const [timezone, setTimezone] = useState(profile?.timezone ?? "Europe/London");
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<"saved" | "invalid" | "error" | "reset" | "">("");
  const input = "mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2";
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = parseProfileSettings(currency, safety, timezone);
    if (!values) { setStatus("invalid"); return; }
    setPending(true); setStatus("");
    try {
      const { error } = await supabase.from("profiles").upsert({ id: userId, ...values });
      setStatus(error ? "error" : "saved");
      if (!error) router.refresh();
    } catch { setStatus("error"); } finally { setPending(false); }
  }
  async function resetPassword() {
    setPending(true); setStatus("");
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: recoveryRequestRedirect(location.origin) });
      setStatus(error ? "error" : "reset");
    } catch { setStatus("error"); } finally { setPending(false); }
  }
  async function signOut() {
    setPending(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) { setStatus("error"); return; }
      window.location.replace("/login");
    } catch { setStatus("error"); } finally { setPending(false); }
  }
  const messages = {
    saved: text("설정을 저장했습니다.", "Settings saved."),
    invalid: text("잔액과 시간대를 확인해 주세요.", "Check the balance and timezone."),
    error: text("요청을 완료하지 못했습니다. 다시 시도해 주세요.", "Could not complete the request. Please try again."),
    reset: text("재설정 이메일을 요청했습니다. 같은 브라우저에서 링크를 열어 주세요.", "Password-reset email requested. Open the link in the same browser."),
  };
  return <main className="min-h-screen bg-slate-50 px-6 py-6 text-slate-950"><div className="mx-auto grid w-full max-w-[1800px] gap-7 lg:grid-cols-[230px_minmax(0,1fr)] xl:px-4">
    <WorkspaceNav section="settings" /><div className="min-w-0 space-y-6">
    <h1 className="text-3xl font-semibold">{text("설정", "Settings")}</h1>
    <div className="grid items-start gap-6 lg:grid-cols-2">
    <div className="space-y-6">
    <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <h2 className="text-lg font-semibold">{text("로그인 정보", "Sign-in details")}</h2>
      <dl className="mt-4 space-y-3"><div><dt className="text-sm text-slate-500">{text("이메일", "Email")}</dt><dd className="break-all">{email}</dd></div>
        <div><dt className="text-sm text-slate-500">{text("로그인 방식", "Sign-in method")}</dt><dd>{providers.map((p) => p === "google" ? "Google" : p === "email" ? text("이메일", "Email") : p).join(" · ")}</dd></div></dl>
      {providers.includes("google") && <p className="mt-4 text-sm text-slate-600">{text("Google 로그인 비밀번호와 보안 설정은 Google 계정에서 관리합니다.", "Manage your Google sign-in password and security in your Google account.")}</p>}
      {providers.includes("email") && <button type="button" disabled={pending} onClick={() => void resetPassword()} className="mt-4 underline disabled:opacity-50">{text("이메일 계정 비밀번호 재설정", "Reset email-account password")}</button>}
    </section>
    <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <h2 className="text-lg font-semibold">{text("화면 언어", "Display language")}</h2>
      <label className="mt-3 block text-sm">{text("언어 (이 브라우저에 저장)", "Language (saved in this browser)")}<select value={locale} onChange={(e) => setLocale(e.target.value === "en" ? "en" : "ko")} className={input}><option value="ko">한국어</option><option value="en">English</option></select></label>
    </section>
    <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <h2 className="text-lg font-semibold">{text("사용 안내", "Walkthroughs")}</h2>
      <p className="mt-2 text-sm text-slate-600">{text("처음 거래를 입력할 때 나오는 수입 안내를 다시 볼 수 있습니다.", "Replay the income walkthrough shown when you first open Transactions.")}</p>
      <button type="button" onClick={() => { window.localStorage.removeItem(walkthroughKey(userId)); router.push("/workspace/actuals"); }} className="mt-4 rounded-lg border border-teal-700 px-4 py-2 text-sm font-medium text-teal-900">{text("수입 입력 안내 다시 보기", "Replay income walkthrough")}</button>
    </section>
    </div>
    <form onSubmit={save} className="space-y-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <h2 className="text-lg font-semibold">{text("자금 관리 설정", "Finance preferences")}</h2>
      <label className="block text-sm">{text("기준 통화", "Reporting currency")}<select className={input} value={currency} onChange={(e) => setCurrency(e.target.value as CurrencyCode)}>{supportedCurrencies.map((code) => <option key={code}>{code}</option>)}</select></label>
      <label className="block text-sm">{text("최소 유지 잔액", "Safety balance")} ({currency})<input required inputMode="decimal" className={input} value={safety} onChange={(e) => setSafety(e.target.value)} /></label>
      <label className="block text-sm">{text("시간대", "Timezone")}<input required list="timezones" className={input} value={timezone} onChange={(e) => setTimezone(e.target.value)} /><datalist id="timezones"><option value="Europe/London" /><option value="Asia/Seoul" /><option value="UTC" /></datalist></label>
      <p className="text-sm text-slate-600">{text("기준 통화를 바꿔도 기존 계획의 금액과 환율 기록은 유지됩니다. 새 기준 통화로 사용할 최소 잔액을 확인해 주세요.", "Existing plan amounts and FX snapshots keep their original currency. Confirm the safety balance for your selected currency.")}</p>
      <button disabled={pending} className="rounded-lg bg-slate-900 px-4 py-2 text-white disabled:opacity-50">{pending ? text("처리 중…", "Working…") : text("설정 저장", "Save settings")}</button>
    </form>
    </div>
    {status && <p role="status" className="rounded-lg border border-slate-300 bg-white p-4">{messages[status]}</p>}
    <button type="button" disabled={pending} onClick={() => void signOut()} className="underline disabled:opacity-50">{text("로그아웃", "Sign out")}</button>
  </div></div></main>;
}
