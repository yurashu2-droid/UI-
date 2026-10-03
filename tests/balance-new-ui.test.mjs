import test from "node:test";
import assert from "node:assert/strict";
import E from "../src/engine.js";
import C from "../src/document.js";
const p = (type, id, x, y, w, h) => C.makeItem(type, id, x, y, w, h);
const make = (player, enemy) =>
  new E.Battle(player, enemy, { playerHp: 10000, enemyHp: 10000 });
const popups = () => [
  p("ad_popup", "pop", 24, 24),
  p("ab_mail", "mail", 24, 120),
];
const target = () => [
  p("gov_pdf", "pdf", 24, 24),
  p("ab_link", "link", 24, 150),
];
const find = (b, side, id) => b[side].parts.find((p) => p.id === id);
const cast = (b, id = "pop") =>
  b._activate(b.player, b.enemy, find(b, "player", id));

test("popup spends conserved charge and fixes its target to strongest opening payload", () => {
  const b = make(popups(), target()),
    pop = find(b, "player", "pop");
  pop.charge = 3;
  cast(b);
  assert.equal(pop.charge, 0);
  assert.equal(b.states.enemy.get("pdf").coveredUntil, 16);
  assert.equal(b.states.enemy.get("link").coveredUntil, 0);
  assert.equal(b.metrics.player.spent, 3);
});
test("unfunded popup neither covers nor spends", () => {
  const b = make(popups(), target());
  cast(b);
  assert.equal(b.states.enemy.get("pdf").coveredUntil, 0);
  assert.equal(b.metrics.player.spent, 0);
});
test("popup pauses and resumes native timer without resetting it", () => {
  const b = make(popups(), target()),
    pdf = find(b, "enemy", "pdf");
  find(b, "player", "pop").charge = 3;
  const before = pdf.remaining;
  cast(b);
  for (let i = 0; i < 16; i++) b.step(0.05);
  assert.equal(pdf.remaining, before);
  b.step(0.05);
  assert.ok(Math.abs(pdf.remaining - (before - 0.05)) < 1e-8);
});
test("duplicate popup sources cannot extend obstruction or bypass shared recovery", () => {
  const b = make([...popups(), p("ad_popup", "pop2", 340, 24)], target());
  const a = find(b, "player", "pop"),
    c = find(b, "player", "pop2");
  a.charge = 6;
  c.charge = 6;
  cast(b);
  b.ticks = 15;
  cast(b, "pop2");
  assert.equal(b.states.enemy.get("pdf").coveredUntil, 16);
  assert.equal(c.charge, 6);
  b.ticks = 75;
  cast(b, "pop2");
  assert.equal(c.charge, 6);
  b.ticks = 76;
  cast(b, "pop2");
  assert.equal(c.charge, 3);
  assert.equal(b.states.enemy.get("pdf").coveredUntil, 92);
});
test("cache blocks only its connected attack and refills eight seconds after use", () => {
  const b = make(popups(), [
    p("gov_pdf", "pdf", 24, 24),
    p("go_cache", "cache", 24, 80),
    p("ab_link", "link", 600, 500),
  ]);
  const pop = find(b, "player", "pop");
  pop.charge = 6;
  cast(b);
  assert.equal(pop.charge, 3);
  assert.equal(b.states.enemy.get("pdf").coveredUntil, 0);
  assert.equal(b.states.enemy.get("cache").cache, false);
  assert.equal(b.states.enemy.get("cache").cacheAt, 160);
  for (let i = 0; i < 159; i++) b.step(0.05);
  assert.equal(b.states.enemy.get("cache").cache, false);
  b.step(0.05);
  assert.equal(b.states.enemy.get("cache").cache, true);
});
test("a remote cache cannot protect the selected target", () => {
  const b = make(popups(), [...target(), p("go_cache", "cache", 600, 500)]);
  find(b, "player", "pop").charge = 3;
  cast(b);
  assert.equal(b.states.enemy.get("pdf").coveredUntil, 16);
});
test("covered attacker rejects incoming replay without deleting its payload", () => {
  const b = make(popups(), [
      p("gov_pdf", "pdf", 24, 24),
      p("gov_page", "echo", 312, 24),
    ]),
    pdf = find(b, "enemy", "pdf"),
    echo = find(b, "enemy", "echo");
  b._activate(b.enemy, b.player, pdf);
  const old = b.player.hp;
  find(b, "player", "pop").charge = 3;
  cast(b);
  b._activate(b.enemy, b.player, echo);
  assert.equal(b.player.hp, old);
  assert.ok(b.states.enemy.get("pdf").payload);
});
test("tip shield competes with carts for one routing allocation", () => {
  const mail = { ...p("ab_mail", "mail", 24, 24), routeTo: "tip" };
  const b = make(
    [mail, p("yt_tip", "tip", 24, 64), p("am_cart", "cart", 256, 24)],
    target(),
  );
  b._earn(b.player, b.enemy, find(b, "player", "mail"), 3);
  assert.equal(b.player.shield, 8);
  assert.equal(b.enemy.hp, 10000);
  assert.equal(b.player.income, 3);
  assert.equal(b.metrics.player.spent, 3);
});
test("tip banks charge at full shield and uses it after shield is lost", () => {
  const b = make(
    [p("ab_mail", "mail", 24, 24), p("yt_tip", "tip", 24, 64)],
    target(),
  );
  b.player.shield = 60;
  b._earn(b.player, b.enemy, find(b, "player", "mail"), 3);
  assert.equal(find(b, "player", "tip").charge, 3);
  b.player.shield = 50;
  b.step(0.05);
  assert.equal(b.player.shield, 58);
  assert.equal(find(b, "player", "tip").charge, 0);
});
test("full support shield banks at most two packets and preserves overflow lifetime income", () => {
  const b = make(
    [p("ab_mail", "mail", 24, 24), p("yt_tip", "tip", 24, 64)],
    target(),
  );
  b.player.shield = 60;
  b._earn(b.player, b.enemy, find(b, "player", "mail"), 30);
  assert.equal(find(b, "player", "tip").charge, 6);
  assert.equal(b.player.income, 30);
  assert.equal(b.metrics.player.routed, 6);
  assert.equal(b.metrics.player.unconverted, 24);
});
test("cache recharge and visible clock use the same analyzed cooldown", () => {
  const b = make(popups(), [
    p("gov_pdf", "pdf", 24, 24),
    p("go_cache", "cache", 24, 80),
    p("go_tabs", "tabs", 24, 132),
  ]);
  const cache = find(b, "enemy", "cache");
  assert.equal(cache.remaining, 0);
  find(b, "player", "pop").charge = 3;
  cast(b);
  assert.equal(
    b.states.enemy.get("cache").cacheAt,
    Math.ceil(cache.period * 20),
  );
  assert.equal(cache.remaining, cache.period);
  b.step(0.05);
  assert.ok(cache.remaining < cache.period);
});
