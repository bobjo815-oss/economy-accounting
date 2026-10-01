"use client";
import { useLanguage } from "@/lib/i18n/provider";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";

import { createClient } from "@/lib/supabase/client";
import { oauthCallbackUrl, recoveryRequestRedirect } from "@/lib/auth/recovery-redirect";

const subscribeToLocation = () => () => undefined;

export default function LoginPage() {
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [oauthPending, setOauthPending] = useState(false);
  const [passwordPending, setPasswordPending] = useState(false);
  const [resetPending, setResetPending] = useState(false);


  const configured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
  const recoveryError = useSyncExternalStore(
    subscribeToLocation,
    () => new URLSearchParams(window.location.search).get("error") === "recovery",
    () => false,
  );
  const oauthError = useSyncExternalStore(
    subscribeToLocation,
    () => new URLSearchParams(window.location.search).get("error") === "oauth",
    () => false,
  );
  const visibleMessage = message || (recoveryError
    ? "복구 링크가 만료되었거나 유효하지 않습니다. 아래에서 새 링크를 요청한 뒤 같은 브라우저에서 열어 주세요."
    : oauthError
      ? "Google 로그인을 완료하지 못했습니다. 다시 시도해 주세요."
      : "");

  async function signInWithGoogle() {
    if (!configured) {
      setMessage("Supabase가 설정되지 않았습니다.");
      return;
    }

    setOauthPending(true);
    setMessage("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: oauthCallbackUrl(window.location.origin) },
    });
    if (error) {
      setOauthPending(false);
      setMessage("Google 로그인을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
  }

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!configured) {
      setMessage("먼저 web/.env.local에 Supabase URL과 publishable key를 설정해 주세요.");
      return;
    }

    setPasswordPending(true);
    setMessage("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setPasswordPending(false);
    setMessage(error ? "이메일 또는 비밀번호가 올바르지 않습니다." : "로그인되었습니다. 대시보드로 이동합니다.");
    if (!error) window.location.replace("/workspace");
  }

  async function requestPasswordReset() {
    if (!configured) {
      setMessage("Supabase가 설정되지 않았습니다.");
      return;
    }
    if (!email) {
      setMessage("먼저 이메일 주소를 입력한 뒤 비밀번호 재설정을 선택해 주세요.");
      return;
    }

    setResetPending(true);
    setMessage("");
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: recoveryRequestRedirect(window.location.origin),
    });
    setResetPending(false);
    setMessage(error
      ? "비밀번호 재설정 이메일을 보내지 못했습니다. 다시 시도해 주세요."
      : "Study Finance 계정이 있는 이메일이라면 재설정 메일이 전송되었습니다. 같은 브라우저에서 링크를 열어 주세요.");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-5 text-slate-950">
      <section className="w-full max-w-md rounded-2xl bg-white p-7 shadow-sm ring-1 ring-slate-200">
        <Link href="/workspace" className="text-sm text-slate-500 hover:text-slate-900">{t("← 워크스페이스")}</Link>
        <h1 className="mt-7 text-2xl font-semibold tracking-tight">{t("로그인")}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">{t("Google 계정으로 간편하게 로그인하거나, 기존 Study Finance 이메일 계정을 사용할 수 있습니다.")}</p>
        <button
          type="button"
          onClick={() => void signInWithGoogle()}
          disabled={oauthPending || passwordPending || resetPending || !configured}
          className="mt-7 flex w-full items-center justify-center gap-3 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span aria-hidden="true" className="flex size-5 items-center justify-center rounded-full bg-white text-base font-bold text-blue-600">G</span>
          {oauthPending ? t("Google로 이동 중…") : t("Google 계정으로 계속하기")}
        </button>
        <div className="my-6 flex items-center gap-3 text-xs text-slate-400" aria-hidden="true">
          <span className="h-px flex-1 bg-slate-200" />{t("또는 이메일 계정")}<span className="h-px flex-1 bg-slate-200" />
        </div>
        <form className="space-y-4" onSubmit={signIn}>
          <label className="block text-sm font-medium">{t("이메일")}<input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-slate-900"
            />
          </label>
          <label className="block text-sm font-medium">{t("비밀번호")}<input
              type="password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-slate-900"
            />
          </label>
          <button
            type="button"
            onClick={() => void requestPasswordReset()}
            disabled={oauthPending || passwordPending || resetPending || !configured}
            className="text-left text-sm font-medium text-slate-700 underline underline-offset-4 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {resetPending ? t("재설정 이메일 전송 중…") : t("비밀번호 재설정")}
          </button>
          <button
            type="submit"
            disabled={oauthPending || passwordPending || resetPending}
            className="w-full rounded-lg bg-slate-900 px-3 py-2.5 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-60"
          >
            {passwordPending ? t("로그인 중…") : t("이메일로 로그인")}
          </button>
          {visibleMessage && <p className="text-sm text-slate-600" role="status">{t(visibleMessage)}</p>}
        </form>
        {!configured && (
          <p className="mt-6 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-900 ring-1 ring-amber-200">{t("로컬 데모는 로그인 없이 대시보드를 볼 수 있습니다. Supabase 프로젝트를 만든 뒤 환경변수를 채우면 이 화면이 활성화됩니다.")}</p>
        )}
      </section>
    </main>
  );
}
