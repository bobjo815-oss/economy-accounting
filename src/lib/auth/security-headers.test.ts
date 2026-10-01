import assert from "node:assert/strict";
import test from "node:test";
import config from "../../../next.config.ts";

test("production responses include restrictive browser security headers", async () => {
  const rules = await config.headers?.();
  assert.ok(rules);
  const headers = new Map(rules[0].headers.map(({ key, value }) => [key.toLowerCase(), value]));

  assert.equal(headers.get("x-content-type-options"), "nosniff");
  assert.equal(headers.get("x-frame-options"), "DENY");
  assert.equal(headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  assert.match(headers.get("strict-transport-security") ?? "", /^max-age=63072000; includeSubDomains$/);

  const policy = headers.get("content-security-policy") ?? "";
  for (const directive of ["default-src 'self'", "base-uri 'self'", "object-src 'none'", "frame-ancestors 'none'"]) {
    assert.ok(policy.includes(directive), `missing CSP directive: ${directive}`);
  }
  assert.ok(policy.includes("https://*.supabase.co"));
  assert.ok(policy.includes("https://api.frankfurter.dev"));
  assert.ok(!policy.includes("unsafe-eval"));
  assert.ok(!policy.includes("https:;") && !policy.includes("*;"));
});
