import test from "node:test";
import assert from "node:assert/strict";
import { serializeCsv } from "./csv-export.ts";

test("CSV export neutralizes spreadsheet formulas after leading whitespace and controls", () => {
  const csv = serializeCsv([
    { description: "=1+2", amount: -12.5 },
    { description: "\t=HYPERLINK(\"https://example.test\")", amount: -3 },
    { description: "\r\n@SUM(1,2)", amount: 10 },
    { description: "\u0000+1+2", amount: 2 },
    { description: " -12.50", amount: 1 },
  ]);
  assert.ok(csv.includes('"\'=1+2","-12.5"'));
  assert.ok(csv.includes('"\'\t=HYPERLINK(""https://example.test"")","-3"'));
  assert.ok(csv.includes('"\'\r\n@SUM(1,2)","10"'));
  assert.ok(csv.includes('"\'\u0000+1+2","2"'));
  assert.ok(csv.includes('" -12.50","1"'));
});
