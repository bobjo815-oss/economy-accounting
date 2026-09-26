import type { RecurringTemplateRow } from "./records.ts";

function dateWithClamp(year: number, monthIndex: number, day: number) {
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, monthIndex, Math.min(day, lastDay))).toISOString().slice(0, 10);
}

export function advanceOccurrence(date: string, cadence: RecurringTemplateRow["cadence"], anchorMonth: number, anchorDay: number) {
  const current = new Date(`${date}T00:00:00Z`);
  if (cadence === "weekly") {
    current.setUTCDate(current.getUTCDate() + 7);
    return current.toISOString().slice(0, 10);
  }
  if (cadence === "monthly") {
    return dateWithClamp(current.getUTCFullYear(), current.getUTCMonth() + 1, anchorDay);
  }
  return dateWithClamp(current.getUTCFullYear() + 1, anchorMonth - 1, anchorDay);
}

export function nextUnproposedDate(template: RecurringTemplateRow, planDates: string[]) {
  let next = template.next_date;
  const existing = new Set(planDates);
  for (let attempt = 0; attempt < 1000 && existing.has(next); attempt++) {
    next = advanceOccurrence(next, template.cadence, template.anchor_month, template.anchor_day);
  }
  return next;
}
