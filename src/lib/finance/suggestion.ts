import type { ActualRow, CashDirection, MerchantRuleRow, RecurringTemplateRow } from "./records.ts";

export function normalizeDescription(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export type CategorySuggestion = { categoryId: string; source: "merchant rule" | "history" | "recurrence" };

export function suggestCategory(
  description: string,
  direction: CashDirection,
  rules: MerchantRuleRow[],
  actuals: ActualRow[],
  templates: RecurringTemplateRow[],
): CategorySuggestion | null {
  const normalized = normalizeDescription(description);
  if (!normalized) return null;
  const rule = [...rules].sort((a, b) => a.priority - b.priority).find((item) => item.normalized_pattern === normalized);
  if (rule) return { categoryId: rule.category_id, source: "merchant rule" };
  const reversed = new Set(actuals.filter((item) => item.correction_of_id).map((item) => item.correction_of_id));
  const historical = actuals.find((item) => !item.is_reversal && !reversed.has(item.id) &&
    item.direction === direction && item.category_id && normalizeDescription(item.description) === normalized);
  if (historical?.category_id) return { categoryId: historical.category_id, source: "history" };
  const template = templates.find((item) => item.is_active && item.direction === direction &&
    item.category_id && normalizeDescription(item.title) === normalized);
  return template?.category_id ? { categoryId: template.category_id, source: "recurrence" } : null;
}
