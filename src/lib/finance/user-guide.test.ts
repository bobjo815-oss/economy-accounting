import { test } from "node:test";
import assert from "node:assert/strict";
import { workspacePages } from "./navigation.ts";
import { getGuideContext, userGuide, userGuideSections } from "./user-guide.ts";

test("every visible workspace page and settings has a bilingual practical guide", () => {
  for (const page of workspacePages) {
    const guide = userGuide[page.id];
    assert.ok(guide, `Missing guide for ${page.id}`);
    assert.ok(guide.summary[0] && guide.summary[1]);
    assert.ok(guide.steps.length >= 2);
    assert.ok(guide.steps.every(([ko, en]) => ko && en));
  }
  assert.ok(userGuide.settings.steps.length >= 2);
  assert.ok(userGuideSections.includes("settings"));
});

test("manual context is restricted to known guide sections", () => {
  assert.equal(getGuideContext("accounts"), "accounts");
  assert.equal(getGuideContext("drafts"), "drafts");
  assert.equal(getGuideContext("settings"), "settings");
  assert.equal(getGuideContext("../../settings"), "overview");
  assert.equal(getGuideContext(undefined), "overview");
});
