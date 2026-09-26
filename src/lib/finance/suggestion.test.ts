import { test } from "node:test";
import assert from "node:assert/strict";
import { suggestCategory } from "./suggestion.ts";
import type { ActualRow, MerchantRuleRow, RecurringTemplateRow } from "./records.ts";

test("exact rule wins over accepted history and recurrence", () => {
  const rule = { normalized_pattern: "tesco", category_id: "rule", priority: 100 } as MerchantRuleRow;
  const historical = { id: "old", description: "Tesco", category_id: "history", direction: "outflow", is_reversal: false } as ActualRow;
  const recurring = { title: "Tesco", category_id: "recurring", direction: "outflow", is_active: true } as RecurringTemplateRow;
  assert.deepEqual(suggestCategory("  TESCO ", "outflow", [rule], [historical], [recurring]), { categoryId: "rule", source: "merchant rule" });
  assert.deepEqual(suggestCategory("Tesco", "outflow", [], [historical], [recurring]), { categoryId: "history", source: "history" });
  assert.deepEqual(suggestCategory("Tesco", "outflow", [], [], [recurring]), { categoryId: "recurring", source: "recurrence" });
});
