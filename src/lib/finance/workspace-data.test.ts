import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadWorkspace } from "./workspace-data.ts";

function client(failedTable?: string) {
  return { from(table: string) {
    const query = {
      select: () => query, eq: () => query, order: () => query, maybeSingle: () => query,
      then(resolve: (value: unknown) => unknown) {
        return Promise.resolve(resolve({
          data: table === "profiles" ? null : [],
          error: table === failedTable ? { message: "unavailable" } : null,
        }));
      },
    };
    return query;
  } } as unknown as SupabaseClient;
}

test("a new owner can load a workspace without a profile or ledger records", async () => {
  const data = await loadWorkspace(client(), "test-owner");
  assert.equal(data.profile, null);
  assert.deepEqual(data.accounts, []);
  assert.deepEqual(data.plans, []);
  assert.deepEqual(data.actualEditProposals, []);
});

test("a failed workspace read is not shown as an empty ledger and a retry can recover", async () => {
  await assert.rejects(loadWorkspace(client("accounts"), "test-owner"));
  await assert.rejects(loadWorkspace(client("actual_edit_proposals"), "test-owner"));
  const data = await loadWorkspace(client(), "test-owner");
  assert.deepEqual(data.accounts, []);
});
