import type { ActualRow, PlanRow, WorkspaceData } from "./records.ts";
import { planCosts } from "./plan-calculation.ts";

export const reviewGuidance = {
  "Overdue plan": ["예정일이 지난 계획", "예정일까지 전액 결제된 기록이 없습니다. 이미 결제했다면 기존 거래와 계획의 연결을 확인하세요. 아직 결제하지 않았다면 ‘정보 수정’에서 예정일을 바꾸거나 계획을 취소하세요. 새 거래를 중복 입력하지 마세요.", "No full payment is recorded by the due date. If paid, check the existing transaction’s plan link. Otherwise, edit the due date or cancel the plan using Edit details. Do not enter a duplicate payment."],
  "Estimate changed": ["예상 금액 변경", "최초 예상과 현재 예상 금액이 다릅니다. 아래 두 금액을 비교하세요. 환율이나 수수료를 고칠 필요가 있으면 ‘환율 / 수수료 수정’을 사용하세요. 예상 변경 자체는 오류가 아니며 실제 결제나 최초 예상은 바뀌지 않습니다.", "The original and current estimates differ. Compare both amounts below; use Revise FX / fee if an assumption needs correcting. A changed estimate is not itself an error and does not change the original estimate or actual payments."],
  "Saved correction": ["미완성 수정안", "아직 확정하지 않은 수정안이 있습니다. ‘바로 수정’에서 저장된 입력값, 계좌와 품목 배분 합계를 확인한 뒤 수정 확정하거나 수정안을 삭제하세요. 확정하기 전에는 잔액에 반영되지 않습니다.", "There are unfinished saved changes. Open Edit inline to check the saved fields, account and split totals, then confirm or discard the changes. They do not affect balances before confirmation."],
} as const;

export function paidOriginalMinor(plan: PlanRow, actuals: ActualRow[], asOf?: string) {
  const visible = actuals.filter((actual) => actual.settlement_status === "settled" && (!asOf || actual.occurred_on <= asOf));
  const reversed = new Set(visible.filter((actual) => actual.is_reversal).map((actual) => actual.correction_of_id));
  return visible.filter((actual) => actual.plan_id === plan.id && !actual.is_reversal && !reversed.has(actual.id))
    .reduce((sum, actual) => sum + BigInt(actual.original_amount_minor), BigInt(0));
}

export function planState(plan: PlanRow, actuals: ActualRow[], asOf: string) {
  if (plan.status === "canceled") return "canceled" as const;
  const paid = paidOriginalMinor(plan, actuals, asOf);
  if (paid >= BigInt(plan.original_amount_minor)) return "completed" as const;
  if (paid > BigInt(0)) return plan.scheduled_date < asOf ? "partial · overdue" as const : "partial" as const;
  return plan.scheduled_date < asOf ? "overdue" as const : "pending" as const;
}

export function reviewItems(data: WorkspaceData, asOf: string) {
  const corrections = data.actuals.filter((actual) => actual.settlement_status === "settled" && !actual.is_reversal &&
    !data.actuals.some((item) => item.correction_of_id === actual.id) &&
    data.actualEditProposals?.some((proposal) => proposal.original_actual_id === actual.id && proposal.status === "pending")).map((actual) => ({
      id: `actual-${actual.id}`, recordId: actual.id, date: actual.occurred_on, title: actual.description, reason: "Saved correction" as const, href: `/workspace/actuals?review=${encodeURIComponent(`actual-${actual.id}`)}`,
    }));
  const overdue = data.plans.filter((plan) => ["overdue", "partial · overdue"].includes(planState(plan, data.actuals, asOf))).map((plan) => ({
    id: `plan-${plan.id}`, recordId: plan.id, date: plan.scheduled_date, title: plan.title, reason: "Overdue plan" as const, href: `/workspace/plans?review=${encodeURIComponent(`plan-${plan.id}`)}`,
  }));
  const fx = data.plans.filter((plan) => plan.status !== "canceled" && plan.currency_code !== plan.base_currency &&
    planCosts(plan, data.rates).baseline !== planCosts(plan, data.rates).forecast && planState(plan, data.actuals, asOf) !== "completed").map((plan) => ({
      id: `fx-${plan.id}`, recordId: plan.id, date: plan.scheduled_date, title: plan.title, reason: "Estimate changed" as const, href: `/workspace/plans?review=${encodeURIComponent(`fx-${plan.id}`)}`,
    }));
  return [...corrections, ...overdue, ...fx].sort((a, b) => a.date.localeCompare(b.date));
}

export function calendarEvents(data: WorkspaceData, month: string, asOf: string) {
  const plans = data.plans.filter((plan) => plan.status !== "canceled" && plan.scheduled_date.startsWith(month)).map((plan) => ({
    id: `plan-${plan.id}`, date: plan.scheduled_date, title: plan.title, kind: "Plan", state: planState(plan, data.actuals, asOf),
  }));
  const actuals = data.actuals.filter((actual) => actual.settlement_status === "settled" && actual.occurred_on.startsWith(month)).map((actual) => ({
    id: `actual-${actual.id}`, date: actual.occurred_on, title: actual.description, kind: actual.is_reversal ? "Reversal" : "Actual", state: "settled",
  }));
  return [...plans, ...actuals].sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind));
}
