import { test } from "node:test";
import assert from "node:assert/strict";
import { parseProfileSettings } from "./profile-settings.ts";
import { resolveLocale, translate } from "../i18n/messages.ts";
import { localDate } from "./local-date.ts";

test("settings validate currency, minor units, and timezone", () => {
  assert.deepEqual(parseProfileSettings("GBP", "123.45", "Asia/Seoul"), { base_currency: "GBP", safety_balance_minor: 12345, timezone: "Asia/Seoul" });
  assert.equal(parseProfileSettings("KRW", "1.5", "UTC"), null);
  assert.equal(parseProfileSettings("GBP", "-1", "UTC"), null);
  assert.deepEqual(parseProfileSettings("EUR", "1", "UTC"), { base_currency: "EUR", safety_balance_minor: 100, timezone: "UTC" });
  assert.deepEqual(parseProfileSettings("KWD", "1.234", "UTC"), { base_currency: "KWD", safety_balance_minor: 1234, timezone: "UTC" });
  assert.equal(parseProfileSettings("GBP", "1", "Invalid/Zone"), null);
});

test("Korean is the default and both interface languages resolve", () => {
  assert.equal(resolveLocale(undefined), "ko");
  assert.equal(resolveLocale("en"), "en");
  assert.equal(resolveLocale("bad"), "ko");
  assert.equal(translate("ko", "Accounts"), "내 계좌");
  assert.equal(translate("ko", "Actual settlements"), "수입·지출 내역");
  assert.equal(translate("en", "Actual settlements"), "Transactions");
  assert.equal(translate("en", "Execution"), "Budget used");
  assert.equal(translate("en", "Accounts"), "Accounts");
  assert.equal(translate("en", "Google 계정으로 계속하기"), "Continue with Google");
});

test("the configured timezone controls the entry date across midnight", () => {
  const now = new Date("2026-01-01T20:00:00Z");
  assert.equal(localDate("Europe/London", now), "2026-01-01");
  assert.equal(localDate("Asia/Seoul", now), "2026-01-02");
});
