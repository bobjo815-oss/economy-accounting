import { allocateReceiptItems, effectiveKrwRate, receiptField } from "@/lib/finance/statement-settlement";
import { formatMinor, type CurrencyCode } from "@/lib/finance/money";

type Props = { date: string; merchant: string; originalMinor: number; currency: CurrencyCode; debitKrw: number; items: unknown[]; locale: "ko" | "en" };
export default function ReceiptDebitBreakdown({ date, merchant, originalMinor, currency, debitKrw, items, locale }: Props) {
  const text = (ko: string,en: string) => locale === "ko" ? ko : en;
  const allocation = allocateReceiptItems(items,originalMinor,currency,debitKrw);
  return <article className="rounded-xl border border-slate-200 bg-white p-4" aria-label={text("품목별 원화 배분", "KRW item allocation")}>
    <div className="flex flex-wrap items-center justify-between gap-2"><div><h5 className="font-semibold">{merchant}</h5><p className="text-sm text-slate-500">{date} · {formatMinor(BigInt(originalMinor),currency)}</p></div><p className="font-semibold text-teal-800">{text("최종 출금", "Final debit")}: {formatMinor(BigInt(debitKrw),"KRW")}</p></div>
    {allocation ? <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[500px] text-left text-sm"><thead className="border-b"><tr>{[text("품목", "Item"),text("수량", "Quantity"),text("영수증 품목 금액", "Receipt line amount"),text("배분된 원화", "Allocated KRW")].map(label=><th key={label} className="p-2">{label}</th>)}</tr></thead><tbody>{allocation.map((row,i)=>{
      const source = row.sourceIndex === null ? null : items[row.sourceIndex] as Record<string,unknown>;
      return <tr key={i} className="border-b border-slate-100"><td className="p-2">{row.unitemized ? text("품목 미확인 잔액", "Unitemized remainder") : row.label}</td><td className="p-2">{source ? receiptField(source.Quantity) || "—" : "—"}</td><td className="p-2">{source && receiptField(source.TotalPrice) ? `${receiptField(source.TotalPrice)} ${currency}` : "—"}</td><td className="p-2 font-medium">{formatMinor(BigInt(row.amountKrw),"KRW")}</td></tr>;
    })}</tbody><tfoot><tr><th colSpan={3} className="p-2">{text("배분 합계 = 카드사 출금액", "Allocated total = card debit")}</th><td className="p-2 font-semibold">{formatMinor(BigInt(allocation.reduce((sum,row)=>sum+row.amountKrw,0)),"KRW")}</td></tr></tfoot></table></div> : <p className="mt-3 rounded bg-amber-50 p-3 text-sm">{text("품목 정보가 없거나 금액이 불명확합니다. 출금 합계는 확인됐지만 품목별 금액을 임의로 만들지 않습니다.", "Item prices are missing or ambiguous. The debit total is confirmed, but individual prices are not invented.")}</p>}
    <p className="mt-3 text-xs text-slate-500">{allocation?.length === 1 && !allocation[0].unitemized ? text("단일 품목: 최종 출금액의 100%를 배분했습니다.", "Single item: allocated 100% of the final debit.") : text("품목 금액 비율로 할인·환산 차이를 배분하고 반올림 차이를 조정했습니다.", "Discounts and conversion differences are allocated proportionally, with rounding reconciled.")} {text("계산된 배분이며 추가 지출이 아닙니다.", "Calculated allocation, not additional spending.")}</p>
    <details className="mt-2 text-xs text-slate-500"><summary className="cursor-pointer">{text("실효 환율 보기", "Show effective rate")}</summary>{effectiveKrwRate(originalMinor,currency,debitKrw)} KRW / {currency} · {text("최종 출금액 기준이며 시장 환율과 다를 수 있습니다.", "Based on the final debit; may differ from market FX.")}</details>
  </article>;
}
