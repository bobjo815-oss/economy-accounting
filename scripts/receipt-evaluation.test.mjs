import test from "node:test";
import assert from "node:assert/strict";
import { evaluateSamples, characterDistance } from "./receipt-evaluation.mjs";
import { pollReceipt, retryDelay, submitReceipt } from "./receipt-polling.mjs";
import { renderReview } from "./receipt-review.mjs";

const field = (value) => ({ state: "visible", value });
const receipt = { merchant: field("Example Store"), date: field("2026-01-15"), total: field("2.60"), currency: field("GBP") };
const answer = { sha256: "synthetic", reviewedBy: "human", reviewedAt: "2026-01-16", receiptCount: 1, receipts: [receipt] };
const prediction = { sha256: "synthetic", receipts: [{ merchant: " EXAMPLE   STORE ", date: "2026-01-15", total: "2.6", currency: "GBP" }] };

test("private review displays original and extracted fields without executing provider text", () => {
  const html = renderReview([{ file: "synthetic.jpg", image: "data:image/jpeg;base64,AA==", prediction: { text: "</pre><script>bad()</script>", receipts: [{ merchant: "<img onerror=bad()>", date: null, total: "2.60", currency: "GBP", items: [{ Description: { valueString: "Example item" }, Quantity: { valueNumber: 2 } }] }] } }]);
  assert.ok(html.includes("data:image/jpeg;base64,AA=="));
  assert.ok(html.includes("상점명"));
  assert.ok(html.includes("추출되지 않음"));
  assert.ok(html.includes("Example item"));
  assert.ok(html.includes("&lt;script&gt;bad()&lt;/script&gt;"));
  assert.ok(!html.includes("<img onerror=bad()>"));
  assert.ok(html.includes("connect-src 'none'"));
});

test("equivalent decimal formatting cannot falsely fail a correct financial draft", () => {
  const result = evaluateSamples([answer], [prediction]);
  assert.equal(result.completeDrafts.correct, 1);
  assert.equal(result.fields.total.correct, 1);
});
test("unreviewed answers and missing runs do not masquerade as zero accuracy", () => {
  assert.equal(evaluateSamples([{ ...answer, reviewedBy: "" }], [prediction]).fields.total.evaluated, 0);
  const result = evaluateSamples([answer], []);
  assert.equal(result.missingRuns, 1);
  assert.equal(result.completeDrafts.evaluated, 0);
  const partial = { ...answer, receipts: [{ ...receipt, total: { state: "unreviewed", value: null } }] };
  assert.equal(evaluateSamples([partial], [prediction]).fields.total.evaluated, 0);
});
test("missing fields and wrong financial facts are counted separately", () => {
  const result = evaluateSamples([answer], [{ ...prediction, receipts: [{ total: "26.00", currency: "USD" }] }]);
  assert.equal(result.fields.merchant.missing, 1);
  assert.equal(result.fields.total.wrong, 1);
  assert.equal(result.fields.currency.wrong, 1);
  assert.equal(result.completeDrafts.correct, 0);
});
test("extra documents fail the complete draft; multi-receipt fields need reviewed associations", () => {
  assert.equal(evaluateSamples([answer], [{ ...prediction, receipts: [...prediction.receipts, {}] }]).completeDrafts.correct, 0);
  const multi = { ...answer, receiptCount: 2, receipts: [receipt, receipt] };
  const result = evaluateSamples([multi], [prediction]);
  assert.equal(result.receiptCounts.correct, 0);
  assert.equal(result.multiReceiptMappingPending, 1);
  assert.equal(result.fields.total.evaluated, 0);
});
test("text recognition errors are measured independently with Unicode characters", () => {
  assert.deepEqual(characterDistance("가나다", "가나"), { edits: 1, characters: 3 });
});

test("rate-limited result checks wait as instructed and never submit an image again", async () => {
  const delays = [];
  const responses = [
    new Response(null, { status: 429, headers: { "retry-after": "12" } }),
    new Response(null, { status: 503 }),
    Response.json({ status: "running" }),
    Response.json({ status: "succeeded", analyzeResult: { documents: [], content: "synthetic" } }),
  ];
  const result = await pollReceipt("https://example.invalid/operation", {
    key: "synthetic", wait: async (ms) => delays.push(ms),
    request: async (url, options) => {
      assert.equal(url, "https://example.invalid/operation");
      assert.equal(options.method, undefined);
      assert.equal(options.body, undefined);
      return responses.shift();
    },
  });
  assert.deepEqual(delays, [3000, 12000, 6000, 3000]);
  assert.equal(result.content, "synthetic");
});

test("retry delays support dates and bound persistent throttling without premature retries", async () => {
  const now = Date.parse("2026-01-01T00:00:00Z");
  assert.equal(retryDelay("Thu, 01 Jan 2026 00:00:20 GMT", 0, now), 20000);
  assert.equal(retryDelay("invalid", 3, now), 24000);
  let calls = 0;
  await assert.rejects(pollReceipt("synthetic", {
    key: "synthetic", wait: async () => {},
    request: async () => { calls++; return new Response(null, { status: 429 }); },
  }), /resume this operation later/);
  assert.equal(calls, 9);
  calls = 0;
  await assert.rejects(pollReceipt("synthetic", {
    key: "synthetic", wait: async () => {},
    request: async () => { calls++; return new Response(null, { status: 429, headers: { "retry-after": "120" } }); },
  }), /long wait/);
  assert.equal(calls, 1);
});

test("failed and malformed analyses are not accepted as completed drafts", async () => {
  for (const body of [{ status: "failed" }, { status: "succeeded", analyzeResult: {} }]) {
    await assert.rejects(pollReceipt("synthetic", {
      key: "synthetic", wait: async () => {}, request: async () => Response.json(body),
    }), /Azure/);
  }
});

test("only explicitly rejected uploads are retried; accepted or uncertain uploads are not", async () => {
  const delays = [];
  let calls = 0;
  const response = await submitReceipt("synthetic", { method: "POST" }, {
    request: async () => { calls++; return new Response(null, { status: calls === 1 ? 429 : 202, headers: { "retry-after": "7" } }); },
    wait: async (ms) => delays.push(ms), onRejected: async (ms) => assert.equal(ms, 7000),
  });
  assert.equal(response.status, 202);
  assert.equal(calls, 2);
  assert.deepEqual(delays, [7000]);
  calls = 0;
  await assert.rejects(submitReceipt("synthetic", {}, {
    request: async () => { calls++; throw new Error("connection lost"); },
    wait: async () => assert.fail("must not retry uncertain upload"), onRejected: async () => assert.fail(),
  }), /connection lost/);
  assert.equal(calls, 1);
  const unavailable = await submitReceipt("synthetic", {}, {
    request: async () => new Response(null, { status: 503 }),
    wait: async () => assert.fail(), onRejected: async () => assert.fail(),
  });
  assert.equal(unavailable.status, 503);
});
