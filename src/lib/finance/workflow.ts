import type { ActualRow, PlanRow, WorkspaceData } from "./records.ts";

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
  const unmatched = data.actuals.filter((actual) => actual.settlement_status === "settled" && !actual.is_reversal && !actual.plan_id &&
    !data.actuals.some((item) => item.correction_of_id === actual.id)).map((actual) => ({
      id: `actual-${actual.id}`, date: actual.occurred_on, title: actual.description, reason: "Unmatched settlement", href: "#actuals",
    }));
  const overdue = data.plans.filter((plan) => ["overdue", "partial · overdue"].includes(planState(plan, data.actuals, asOf))).map((plan) => ({
    id: `plan-${plan.id}`, date: plan.scheduled_date, title: plan.title, reason: "Overdue plan", href: "#plans",
  }));
  const fx = data.plans.filter((plan) => plan.status !== "canceled" && plan.currency_code !== plan.base_currency &&
    plan.baseline_fx_snapshot_id !== plan.forecast_fx_snapshot_id && planState(plan, data.actuals, asOf) !== "completed").map((plan) => ({
      id: `fx-${plan.id}`, date: plan.scheduled_date, title: plan.title, reason: "FX assumption changed", href: "#plans",
    }));
  return [...unmatched, ...overdue, ...fx].sort((a, b) => a.date.localeCompare(b.date));
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
