import test from "node:test";
import assert from "node:assert/strict";

const feedback = await import("../src/catalog/combat-feedback.js").catch(() => ({}));
const state = { coveredUntil: 26, immuneUntil: 86, cache: false, cacheAt: 170, target: "a" };

test("cover feedback follows simulation ticks and ends exactly at release", () => {
  assert.equal(typeof feedback.combatFeedback, "function");
  const covered = feedback.combatFeedback("gov_pdf", 0, 10, state, "", 0);
  assert.equal(covered.covered, true);
  assert.equal(covered.remaining, "0.8");
  const released = feedback.combatFeedback("gov_pdf", 0, 26, state, "", 0);
  assert.equal(released.covered, false);
  assert.equal(released.recovering, true);
});

test("cache and support feedback explains scope, refill and full-shield waiting", () => {
  assert.equal(typeof feedback.combatFeedback, "function");
  const cache = feedback.combatFeedback("go_cache", 0, 10, state, "PDFダウンロード行", 0);
  assert.match(cache.stateText, /8.0秒/);
  assert.match(cache.targetText, /PDFダウンロード行/);
  const ready = feedback.combatFeedback("go_cache", 0, 170, { ...state, cache: true }, "PDF", 0);
  assert.match(ready.stateText, /準備完了/);
  const tip = feedback.combatFeedback("yt_tip", 3, 10, undefined, "", 60);
  assert.match(tip.stateText, /満杯.*待機/);
});

test("fractional charges stay readable without pretending they are whole dollars", () => {
  assert.equal(typeof feedback.combatFeedback, "function");
  const popup = feedback.combatFeedback("ad_popup", 1.5000000000000002, 0, undefined, "長文ポスト", 0);
  assert.equal(popup.chargeText, "1.5");
  assert.match(popup.stateText, /出稿待ち/);
  assert.match(popup.targetText, /長文ポスト/);
});
