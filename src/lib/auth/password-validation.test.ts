import { test } from "node:test";
import assert from "node:assert/strict";
import { passwordError } from "./password-validation.ts";

test("password setup requires a long matching confirmation", () => {
  assert.equal(passwordError("short", "short"), "Use at least 12 characters.");
  assert.equal(passwordError("long-enough-secret", "different-secret"), "The passwords do not match.");
  assert.equal(passwordError("long-enough-secret", "long-enough-secret"), null);
});
