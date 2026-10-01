import assert from "node:assert/strict";
import test from "node:test";
import { requiresStrongSession } from "./assurance.ts";

test("a ledger session requires an enrolled TOTP factor", () => {
  assert.equal(requiresStrongSession(0, "aal1", "aal1"), true);
});

test("an enrolled factor requires a fresh second-factor challenge", () => {
  assert.equal(requiresStrongSession(1, "aal1", "aal2"), true);
});

test("an AAL2 session is allowed through", () => {
  assert.equal(requiresStrongSession(1, "aal2", "aal2"), false);
});
