import test from "node:test";
import assert from "node:assert/strict";
import D from "../src/data.js";
import C from "../src/document.js";
import V from "../src/components.js";
import { RECIPES } from "../src/fusion.js";

test("first balance batch defines distinct popup, cache and revenue-defense roles", () => {
  const popup = D.PARTS.ad_popup;
  const cache = D.PARTS.go_cache;
  const tip = D.PARTS.yt_tip;
  assert.ok(popup, "popup advertisement is in the canonical catalogue");
  assert.ok(cache, "cached-copy control is in the canonical catalogue");
  assert.ok(tip, "support conversion is in the canonical catalogue");
  assert.deepEqual([popup.cd, popup.value, popup.load, popup.price], [6, 0.8, 3, 7]);
  assert.deepEqual([cache.cd, cache.value, cache.load, cache.price], [8, 1, 2, 5]);
  assert.deepEqual([tip.cd, tip.value, tip.load, tip.fused], [0, 8, 2, true]);
  assert.match(popup.desc, /1つ|一つ/);
  assert.match(cache.desc, /1回|一回/);
  assert.match(cache.desc, /基本8秒/);
  assert.match(tip.desc, /シールド/);
  assert.match(popup.desc, /最大\$?6/);
  assert.match(tip.desc, /最大\$?6/);
  assert.notEqual(popup.layout, cache.layout);
  assert.notEqual(cache.layout, tip.layout);
});

test("support fusion spends the purchase and membership parts", () => {
  assert.ok(RECIPES.some((r) => r.a === "am_buy" && r.b === "yt_sub" && r.into === "yt_tip"));
  assert.equal(RECIPES.filter((r) => r.into === "yt_tip").length, 1);
});

test("catalogue explanations match media scope, original-only replay and conserved conversion", () => {
  assert.doesNotMatch(D.PARTS.yt_speed.desc, /近接する時間発動UIを2倍/);
  assert.match(D.PARTS.yt_speed.desc, /動画本体/);
  for (const id of ["yt_autoplay", "go_page", "gov_page", "ab_marquee"]) assert.match(D.PARTS[id].desc, /最後の通常/);
  assert.match(D.PARTS.am_cart.desc, /チャージ.*消費/);
  assert.match(D.PARTS.yt_ad.desc, /通常/);
});

test("new UI markup preserves native silhouettes and escapes edited labels", () => {
  assert.equal(typeof V.markup, "function", "renderer exposes its pure native markup function");
  for (const [type, element, state] of [
    ["ad_popup", /<aside\b/, /popup-charge/],
    ["go_cache", /<a\b/, /cache-state/],
    ["yt_tip", /<button\b/, /support-state/],
  ]) {
    const p = C.makeItem(type, type, 20, 20);
    p.label = '<img src=x onerror="alert(1)">';
    const html = V.markup(p);
    assert.match(html, element);
    assert.match(html, state);
    assert.match(html, /&lt;img/);
    assert.doesNotMatch(html, /<img\b|window\.open|<script|onclick=/i);
  }
});

test("embedded video accepts its existing control row through native snapping", () => {
  const player = C.makeItem("yt_embed", "video", 32, 32, 560, 280);
  const control = C.makeItem("yt_speed", "speed", null, null);
  const snapped = C.snap([player], control, 35, 313);
  assert.equal(snapped.target, player.id);
  assert.equal(snapped.y, 312);
  assert.match(snapped.hint, /動画プレイヤー/);
  Object.assign(control, snapped);
  assert.ok(C.analyze([player, control]).groups.some((g) => g.kind === "media-stack"));
});

test("instant search retains search-panel composition and suggestion snapping", () => {
  const search = C.makeItem("go_instant", "query", 32, 32, 420, 44);
  const suggestions = C.makeItem("go_suggest", "suggest", null, null);
  const snapped = C.snap([search], suggestions, 34, 77);
  assert.equal(snapped.target, search.id);
  assert.equal(snapped.y, 76);
  Object.assign(suggestions, snapped);
  assert.ok(C.analyze([search, suggestions]).groups.some((g) => g.kind === "search-stack"));
});

test('blue-link explanation states the promoted page-wide attention and whitespace limits', () => {
  assert.match(D.PARTS.ab_link.desc, /ページ.*先頭2/);
  assert.match(D.PARTS.ab_link.desc, /6.*超.*5%/);
});

test('fused advertising description cannot promise revenue from echoed or controller activations', () => {
  assert.match(D.PARTS.ad_retarget.desc, /通常.*時間発動/);
  assert.match(D.PARTS.ad_retarget.desc, /再発動.*収益.*生まない/);
});
