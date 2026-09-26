import { test } from "node:test";
import assert from "node:assert/strict";
import { advanceOccurrence, nextUnproposedDate } from "./recurrence.ts";
import type { RecurringTemplateRow } from "./records.ts";

test("monthly recurrence retains the original day after a short month", () => {
  assert.equal(advanceOccurrence("2027-01-31", "monthly", 1, 31), "2027-02-28");
  assert.equal(advanceOccurrence("2027-02-28", "monthly", 1, 31), "2027-03-31");
});

test("recurrence skips existing proposals and never makes an actual", () => {
  const template = { next_date: "2026-09-01", cadence: "monthly", anchor_month: 9, anchor_day: 1 } as RecurringTemplateRow;
  assert.equal(nextUnproposedDate(template, ["2026-09-01", "2026-10-01"]), "2026-11-01");
});
