import { test } from "node:test";
import assert from "node:assert/strict";
import { workspacePages, workspaceHref, isWorkspaceSection } from "./navigation.ts";

test("needs-completion navigation uses the short label without changing its URL", () => {
  const page = workspacePages.find(page => page.id === "drafts");
  assert.equal(page?.ko, "보완 필요 거래");
  assert.equal(page?.en, "Needs completion");
  assert.equal(page && "navigation" in page ? page.navigation : true, false);
  assert.equal(workspaceHref("drafts"), "/workspace/drafts");
});

test("record and analysis navigation uses the consistent income-first wording", () => {
  assert.equal(workspacePages.find(page => page.id === "plans")?.ko, "수입·지출 계획");
  assert.equal(workspacePages.find(page => page.id === "reports")?.ko, "수입·지출 분석");
});

test("each workspace task has a unique real page and bilingual navigation", () => {
  const urls = workspacePages.map((page) => workspaceHref(page.id));
  assert.equal(new Set(urls).size, workspacePages.length);
  assert.equal(workspaceHref("overview"), "/workspace");
  for (const page of workspacePages) {
    assert.ok(page.ko && page.en && page.descriptionKo && page.descriptionEn);
    assert.ok(!workspaceHref(page.id).includes("#"));
    assert.equal(isWorkspaceSection(page.id), true);
  }
  assert.equal(isWorkspaceSection("../settings"), false);
  assert.equal(isWorkspaceSection("unknown"), false);
});
