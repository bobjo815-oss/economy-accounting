import { test } from "node:test";
import assert from "node:assert/strict";
import { suggestCategory } from "./suggestion.ts";
import type { ActualRow, MerchantRuleRow, RecurringTemplateRow } from "./records.ts";

test("exact rule wins over accepted history and recurrence", () => {
  const rule = { normalized_pattern: "example shop", category_id: "rule", priority: 100 } as MerchantRuleRow;
  const historical = { id: "old", description: "Example Shop", category_id: "history", direction: "outflow", is_reversal: false } as ActualRow;
  const recurring = { title: "Example Shop", category_id: "recurring", direction: "outflow", is_active: true } as RecurringTemplateRow;
  assert.deepEqual(suggestCategory("  EXAMPLE SHOP ", "outflow", [rule], [historical], [recurring]), { categoryId: "rule", source: "merchant rule" });
  assert.deepEqual(suggestCategory("Example Shop", "outflow", [], [historical], [recurring]), { categoryId: "history", source: "history" });
  assert.deepEqual(suggestCategory("Example Shop", "outflow", [], [], [recurring]), { categoryId: "recurring", source: "recurrence" });
});
