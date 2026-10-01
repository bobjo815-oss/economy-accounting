import { test } from "node:test";
import assert from "node:assert/strict";
import {
  authDestination,
  oauthCallbackUrl,
  recoveryCallbackPath,
  recoveryRequestRedirect,
} from "./recovery-redirect.ts";

test("OAuth callback uses the current deployment origin", () => {
  assert.equal(
    oauthCallbackUrl("https://study-finance-tracker.vercel.app/login"),
    "https://study-finance-tracker.vercel.app/auth/callback",
  );
});

test("password recovery uses the configured production-safe homepage redirect", () => {
  assert.equal(
    recoveryRequestRedirect("https://study-finance-tracker.vercel.app/login"),
    "https://study-finance-tracker.vercel.app/",
  );
});

test("a recovery code is preserved and routed to password setup", () => {
  assert.equal(
    recoveryCallbackPath("code with symbols/+"),
    "/auth/callback?code=code+with+symbols%2F%2B&next=%2Fset-password",
  );
  assert.equal(authDestination("/set-password"), "/set-password");
});

test("the auth callback rejects untrusted destinations", () => {
  assert.equal(authDestination("https://attacker.example"), "/workspace");
  assert.equal(authDestination("//attacker.example"), "/workspace");
  assert.equal(authDestination(null), "/workspace");
});

test("fresh sign-in always starts at home, not an earlier section or anchor", () => {
  for (const previous of ["/workspace/plans", "/workspace/actuals", "/settings", "/workspace#calendar"]) {
    assert.equal(authDestination(previous), "/workspace");
  }
});
