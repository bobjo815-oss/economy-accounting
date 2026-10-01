import { test } from "node:test";
import assert from "node:assert/strict";
import { starterCategories } from "./starter-categories.ts";

test("starter categories are bilingual, user-owned, and list income before expenses", () => {
  for (const locale of ["ko", "en"] as const) {
    const categories = starterCategories("owner", locale);
    assert.equal(categories.length, 18);
    assert.ok(categories.every((category) => category.user_id === "owner"));
    const firstExpense = categories.findIndex((category) => category.normal_direction === "outflow");
    assert.ok(categories.slice(0, firstExpense).every((category) => category.normal_direction === "inflow"));
    assert.ok(categories.slice(firstExpense).every((category) => category.normal_direction === "outflow"));
  }
  assert.equal(starterCategories("owner", "ko")[0].name, "급여");
  assert.equal(starterCategories("owner", "en")[0].name, "Pay");
});
