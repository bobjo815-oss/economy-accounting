"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/lib/i18n/provider";

export function walkthroughKey(userId: string) {
  return `study-finance-transaction-walkthrough:${userId}`;
}

const steps = [
  {
    title: ["이미 받은 돈은 ‘수입’으로 기록해요", "Record money you have received as income"],
    body: ["급여, 장학금, 환급처럼 이미 들어온 돈은 이 페이지에서 거래로 기록합니다. 아직 받을 돈이라면 ‘예정된 수입·지출’에 계획으로 먼저 등록하세요.", "Record money already received—such as pay, a scholarship, or a refund—as a transaction here. If you expect it later, add it first as a plan under Upcoming payments."],
  },
  {
    title: ["날짜와 내용을 입력하세요", "Enter the date and description"],
    body: ["실제로 돈을 받은 날짜와 알아보기 쉬운 내용을 적습니다. 예: ‘9월 아르바이트 급여’ 또는 ‘장학금’.", "Enter the date the money actually arrived and a clear description, such as “September part-time pay” or “Scholarship.”"],
  },
  {
    title: ["금액과 입금 계좌를 확인하세요", "Check the amount and receiving account"],
    body: ["‘거래 금액’에는 원래 통화의 금액을, ‘계좌 반영 금액’에는 계좌 내역에 실제 입금된 금액을 적으세요. 계좌 통화와 거래 통화가 같다면 보통 두 금액은 같습니다. 입금 계좌는 미리 ‘내 계좌’에서 등록해야 합니다.", "Enter the amount in its original currency under Transaction amount, and the actual credited amount from your statement under Final account amount. They are usually the same when both currencies match. Add the receiving account under Accounts first."],
  },
  {
    title: ["수입 종류를 분류하고 저장하세요", "Choose an income category and save"],
    body: ["급여·장학금처럼 해당하는 수입 분류를 선택하면 분석 화면에서 종류별로 볼 수 있어요. 분류가 아직 없다면 비워 두고 저장한 뒤 ‘수입·지출 분류’에서 추가해도 됩니다. 마지막으로 ‘거래 기록’을 누르면 실제 수입으로 반영됩니다.", "Choose a category such as Pay or Scholarship to see it in income analysis. You can leave it uncategorized and add categories later. Select Record settlement to save it as actual income."],
  },
] as const;

export default function TransactionWalkthrough({ userId, onChooseIncome }: { userId: string; onChooseIncome: () => void }) {
  const { locale } = useLanguage();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const ko = locale === "ko";
  const close = () => {
    window.localStorage.setItem(walkthroughKey(userId), "done");
    setOpen(false);
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (window.localStorage.getItem(walkthroughKey(userId)) !== "done") setOpen(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [userId]);

  if (!open) return null;
  const current = steps[step];
  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="transaction-walkthrough-title" className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">
      <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-teal-700">{ko ? `수입 입력 안내 · ${step + 1}/${steps.length}` : `Income walkthrough · ${step + 1}/${steps.length}`}</p><h2 id="transaction-walkthrough-title" className="mt-2 text-xl font-semibold">{current.title[ko ? 0 : 1]}</h2></div><button type="button" onClick={close} aria-label={ko ? "안내 닫기" : "Close walkthrough"} className="rounded-lg px-3 py-1 text-slate-500 hover:bg-slate-100">✕</button></div>
      <p className="mt-4 text-sm leading-6 text-slate-700">{current.body[ko ? 0 : 1]}</p>
      {step === 2 && <Link href="/workspace/accounts" onClick={close} className="mt-3 inline-block text-sm font-medium text-teal-800 underline">{ko ? "내 계좌 확인·추가 →" : "View or add an account →"}</Link>}
      <div className="mt-6 flex items-center justify-between gap-3"><button type="button" onClick={close} className="text-sm text-slate-600 underline">{ko ? "건너뛰기" : "Skip"}</button><div className="flex gap-2"><button type="button" disabled={step === 0} onClick={() => setStep((value) => value - 1)} className="rounded-lg border px-4 py-2 text-sm disabled:opacity-40">{ko ? "이전" : "Back"}</button>{step < steps.length - 1 ? <button type="button" onClick={() => setStep((value) => value + 1)} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white">{ko ? "다음" : "Next"}</button> : <button type="button" onClick={() => { onChooseIncome(); close(); }} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white">{ko ? "수입 입력 시작" : "Start entering income"}</button>}</div></div>
    </section>
  </div>;
}
