"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/lib/i18n/provider";

type Factor = { id: string; status: string; friendly_name?: string };

export default function SecuritySettings() {
  const { locale } = useLanguage();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const text = useCallback((ko: string, en: string) => locale === "ko" ? ko : en, [locale]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [factors, setFactors] = useState<Factor[]>([]);
  const [factorId, setFactorId] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [aal2, setAal2] = useState(false);
  const [error, setError] = useState("");

  const getSecurityStatus = useCallback(async () => {
    const [factorResult, assuranceResult] = await Promise.all([
      supabase.auth.mfa.listFactors(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    ]);
    return factorResult.error || assuranceResult.error
      ? { error: true as const }
      : { error: false as const, factors: factorResult.data.totp, aal2: assuranceResult.data.currentLevel === "aal2" };
  }, [supabase]);

  const loadFactors = useCallback(async () => {
    const status = await getSecurityStatus();
    if (status.error) setError(text("보안 상태를 불러오지 못했습니다. 다시 시도해 주세요.", "Could not load security status. Please try again."));
    else { setFactors(status.factors); setAal2(status.aal2); }
    setLoading(false);
  }, [getSecurityStatus, text]);

  useEffect(() => {
    let active = true;
    void getSecurityStatus().then((status) => {
      if (!active) return;
      if (status.error) setError(text("보안 상태를 불러오지 못했습니다. 다시 시도해 주세요.", "Could not load security status. Please try again."));
      else { setFactors(status.factors); setAal2(status.aal2); }
      setLoading(false);
    });
    return () => { active = false; };
  }, [getSecurityStatus, text]);

  async function startEnrollment() {
    setBusy(true); setError("");
    const result = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Study Finance" });
    if (result.error) {
      setError(text("인증 앱 등록을 시작하지 못했습니다. 다시 로그인한 뒤 재시도해 주세요.", "Could not start authenticator setup. Sign in again and retry."));
    } else {
      setFactorId(result.data.id);
      setQrCode(result.data.totp.qr_code);
      setSecret(result.data.totp.secret);
    }
    setBusy(false);
  }

  async function verifyCode() {
    if (!factorId || !/^\d{6,8}$/.test(code.trim())) {
      setError(text("인증 앱의 숫자 코드를 입력해 주세요.", "Enter the numeric code from your authenticator app."));
      return;
    }
    setBusy(true); setError("");
    const challenge = await supabase.auth.mfa.challenge({ factorId });
    if (challenge.error) {
      setError(text("인증 코드를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.", "Could not start code verification. Please try again shortly."));
      setBusy(false); return;
    }
    const verification = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.data.id, code: code.trim() });
    if (verification.error) {
      setError(text("코드가 맞지 않거나 만료되었습니다. 새 코드를 입력해 주세요.", "That code is incorrect or expired. Enter a fresh code."));
      setCode(""); setBusy(false); return;
    }
    setCode(""); setQrCode(""); setSecret(""); setFactorId("");
    await loadFactors();
    setBusy(false);
    router.replace("/workspace");
    router.refresh();
  }

  async function cancelEnrollment() {
    if (!factorId) return;
    setBusy(true);
    const result = await supabase.auth.mfa.unenroll({ factorId });
    setFactorId(""); setQrCode(""); setSecret(""); setCode("");
    if (result.error) setError(text("미완료 등록을 정리하지 못했습니다. 다시 시도해 주세요.", "Could not cancel the pending setup. Please retry."));
    setBusy(false);
    await loadFactors();
  }

  async function signOut() {
    setBusy(true);
    const result = await supabase.auth.signOut();
    if (!result.error) router.replace("/login");
    else { setBusy(false); setError(text("로그아웃하지 못했습니다. 다시 시도해 주세요.", "Could not sign out. Please retry.")); }
  }

  const verified = factors.filter((factor) => factor.status === "verified");
  return <main className="mx-auto min-h-screen w-full max-w-3xl bg-slate-50 px-6 py-12 text-slate-900">
    <section className="rounded-2xl bg-white p-7 shadow-sm ring-1 ring-slate-200">
      <p className="text-sm font-semibold text-teal-800">🔐 {text("계정 보안", "Account security")}</p>
      <h1 className="mt-2 text-2xl font-semibold">{text("2단계 인증 설정", "Set up two-step verification")}</h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">{text("금융 기록을 열기 전에 인증 앱의 일회용 코드를 확인합니다. Google 로그인만으로 끝나지 않도록 앱 데이터베이스에서도 2단계 인증을 확인하게 됩니다.", "Your authenticator app's one-time code will be required before opening financial records. The database will enforce this too; Google sign-in alone will not be enough.")}</p>
      <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{text("휴대전화를 바꾸기 전에 새 기기에 인증 앱을 옮겨 주세요. 인증 기기를 잃으면 Supabase 프로젝트 소유자 복구 절차가 필요할 수 있습니다. 등록이 끝나기 전에는 금융 기록이 잠길 수 있습니다.", "Transfer your authenticator before replacing your phone. Losing it may require recovery through the Supabase project owner. Until enrollment is complete, financial records may remain locked.")}</p>
      {loading ? <p className="mt-6" role="status">{text("불러오는 중…", "Loading…")}</p> : <>
        {verified.length > 0 && aal2 && <div className="mt-6 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-900">{text("2단계 인증이 확인되었습니다.", "Two-step verification is active for this session.")}</div>}
        {verified.length > 0 && !aal2 && <>
          <p className="mt-6 text-sm font-medium">{text("인증 앱의 현재 코드를 입력해 주세요.", "Enter the current code from your authenticator app.")}</p>
          <form className="mt-2 flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); void verifyCode(); }}>
            <input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,8}" maxLength={8} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} aria-label={text("2단계 인증 코드", "Two-step verification code")} className="rounded-lg border border-slate-300 px-3 py-2 tracking-widest" />
            <button disabled={busy} className="rounded-lg bg-teal-800 px-4 py-2 text-white disabled:opacity-50">{text("확인하고 계속", "Verify and continue")}</button>
          </form>
        </>}
        {verified.length === 0 && !factorId && <button type="button" disabled={busy} onClick={() => void startEnrollment()} className="mt-6 rounded-lg bg-teal-800 px-4 py-2 font-medium text-white disabled:opacity-50">{text("인증 앱 연결하기", "Connect an authenticator app")}</button>}
        {qrCode && <div className="mt-6 rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold">{text("인증 앱에서 QR 코드를 스캔하세요", "Scan this QR code in your authenticator app")}</h2>
          <Image src={qrCode} alt={text("일회용 코드용 인증 QR 코드", "Authenticator QR code for one-time codes")} width={192} height={192} unoptimized className="mt-4 h-48 w-48 rounded border bg-white p-2" />
          <details className="mt-3"><summary className="cursor-pointer text-sm underline">{text("QR을 스캔할 수 없나요? 직접 입력", "Can't scan? Enter the setup key manually")}</summary><code className="mt-2 block break-all rounded bg-slate-100 p-3 text-sm">{secret}</code></details>
          <label className="mt-4 block text-sm">{text("앱에 표시된 숫자 코드", "Numeric code shown in the app")}
            <input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,8}" maxLength={8} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 tracking-widest" />
          </label>
          <div className="mt-3 flex flex-wrap gap-3"><button type="button" disabled={busy} onClick={() => void verifyCode()} className="rounded-lg bg-teal-800 px-4 py-2 text-white disabled:opacity-50">{text("등록 확인", "Verify setup")}</button><button type="button" disabled={busy} onClick={() => void cancelEnrollment()} className="rounded-lg border border-slate-300 px-4 py-2 disabled:opacity-50">{text("취소", "Cancel")}</button></div>
        </div>}
      </>}
      {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
      <div className="mt-7 flex flex-wrap gap-4 text-sm"><a href="/login" className="underline">{text("로그인 화면", "Sign-in page")}</a><button type="button" disabled={busy} onClick={() => void signOut()} className="underline disabled:opacity-50">{text("로그아웃", "Sign out")}</button></div>
    </section>
  </main>;
}
