"use client";
import Link from "next/link";
import { useLanguage } from "@/lib/i18n/provider";
import { reviewGuidance, reviewItems } from "@/lib/finance/workflow";
import { localDate } from "@/lib/finance/local-date";
import type { WorkspaceData } from "@/lib/finance/records";

export default function ReviewFocus({ data, target, section }: { data: WorkspaceData; target: string; section: "plans" | "actuals" }) {
  const { locale } = useLanguage();
  const item = reviewItems(data, localDate(data.profile?.timezone)).find(item => item.id === target);
  const copy = item ? reviewGuidance[item.reason] : null;
  return <aside role="status" className="mb-5 rounded-xl border-2 border-amber-400 bg-amber-50 p-5 text-amber-950">
    <h3 className="font-semibold">{copy ? (locale === "ko" ? copy[0] : item!.reason) : locale === "ko" ? "현재 확인 대상이 아닙니다" : "No longer needs this review"}</h3>
    <p className="mt-2 text-sm">{copy ? copy[locale === "ko" ? 1 : 2] : locale === "ko" ? "이미 해결되었거나 기록이 변경·삭제되었습니다. 목록을 다시 확인하세요." : "This issue was resolved or the record was changed or removed. Check the updated list."}</p>
    {item && <p className="mt-2 text-sm font-medium">{item.date} · {item.title} — {locale === "ko" ? "아래에는 이 기록만 표시합니다." : "Only this record is shown below."}</p>}
    <div className="mt-3 flex gap-5 text-sm"><Link className="underline" href="/workspace/review">{locale === "ko" ? "확인할 항목으로 돌아가기" : "Back to needs attention"}</Link><Link className="underline" href={`/workspace/${section}`}>{locale === "ko" ? "전체 목록 보기" : "Show all records"}</Link></div>
  </aside>;
}
