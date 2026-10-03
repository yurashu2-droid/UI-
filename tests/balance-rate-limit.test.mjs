import test from "node:test";
import assert from "node:assert/strict";
import E from "../src/engine.js";
import C from "../src/document.js";
const make = (count = 1) =>
  new E.Battle(
    [],
    Array.from({ length: count }, (_, i) =>
      C.makeItem("gov_rate_limit", "limit" + i, 24 + i * 300, 24),
    ),
    { playerHp: 10000, enemyHp: 10000 },
  );
const hit = (b, value, pierce = 0) =>
  b._hit(b.player, b.enemy, { damage: 0 }, value, pierce);
test("request limiter has a stronger fractional effect on small nonpiercing hits", () => {
  const small = make(),
    large = make();
  hit(small, 7);
  hit(large, 40);
  assert.equal(10000 - small.enemy.hp, 3);
  assert.equal(10000 - large.enemy.hp, 36);
});
test("rate limiting preserves original piercing damage before regular mitigation", () => {
  const b = make();
  b.enemy.shield = 100;
  hit(b, 18, 0.5);
  assert.equal(b.enemy.hp, 9991);
  assert.equal(b.enemy.shield, 95);
  assert.equal(b.metrics.enemy.rateLimited, 4);
  assert.equal(b.metrics.player.shieldDamage, 5);
});
test("fully piercing attacks never consume the request limit budget", () => {
  const b = make();
  hit(b, 18, 1);
  assert.equal(b.enemy.hp, 9982);
  assert.equal(b.rateBudget.enemy, 24);
});
test("duplicate request limiters cannot stack mitigation or burst capacity", () => {
  const a = make(),
    b = make(2);
  for (let i = 0; i < 10; i++) {
    hit(a, 10);
    hit(b, 10);
  }
  assert.equal(a.enemy.hp, 9924);
  assert.equal(b.enemy.hp, a.enemy.hp);
  assert.equal(a.rateBudget.enemy, 0);
  assert.equal(b.rateBudget.enemy, 0);
});
test("rate budget refills continuously on fixed ticks and cannot bank above cap", () => {
  const b = make();
  for (let i = 0; i < 6; i++) hit(b, 10);
  b.step(0.25);
  assert.ok(Math.abs(b.rateBudget.enemy - 6) < 1e-8);
  b.step(2);
  assert.equal(b.rateBudget.enemy, 24);
});
test("endgame overload bypasses request limiting just as it bypasses shields", () => {
  const b = make();
  b.ticks = 899;
  b.elapsed = 44.95;
  b.enemy.shield = 60;
  b.step(0.05);
  assert.equal(b.enemy.hp, 9992);
  assert.equal(b.enemy.shield, 60);
});
