import test from "node:test";
import assert from "node:assert/strict";
import C from "../src/document.js";
import E from "../src/engine.js";
let P;
try {
  P = await import("../scripts/experiments/replay-guard.js");
} catch {}
const config = { fraction: 0.35, capacity: 12, refillPerSecond: 12 };
function make(duplicate = false) {
  assert.equal(typeof P?.ReplayGuardBattle, "function");
  const a = [
    C.makeItem("gov_rate_limit", "guard", 24, 24, 280, 88),
    ...(duplicate
      ? [C.makeItem("gov_rate_limit", "guard2", 312, 24, 280, 88)]
      : []),
  ];
  const b = [
    C.makeItem("gov_pdf", "pdf", 24, 24, 280, 48),
    C.makeItem("go_page", "echo", 312, 24, 280, 36),
  ];
  return new P.ReplayGuardBattle(
    a,
    b,
    { playerHp: 200, enemyHp: 200 },
    { config, slots: { player: a.map((p) => p.id), enemy: [] } },
  );
}
function payload(b, value = 40, pierce = 0.5) {
  const source = b.enemy.parts.find((p) => p.id === "pdf"),
    controller = b.enemy.parts.find((p) => p.id === "echo");
  b._attack(b.enemy, b.player, source, 1);
  b.states.enemy.get(source.id).payload = { value, pierce };
  b.player.hp = 200;
  return { source, controller };
}
test("replay origin survives the pending-hit queue and natural attacks bypass the guard", () => {
  const b = make(),
    { source, controller } = payload(b);
  b.pendingHits = [];
  b._replay(b.enemy, b.player, controller, source, 0.5);
  b._hit(b.enemy, b.player, source, 20, 0.5);
  const pending = b.pendingHits;
  b.pendingHits = null;
  for (const apply of pending) apply();
  assert.equal(b.player.hp, 163.5);
  assert.equal(b.guardStats.player.prevented, 3.5);
  assert.equal(b.replayPackets.length, 1);
  assert.equal(b.replayPackets[0].naturalRevision, 1);
});
test("a conversion count does not invent a new natural payload revision", () => {
  const b = make(),
    { source, controller } = payload(b);
  source.fires += 10;
  b._replay(b.enemy, b.player, controller, source, 0.5);
  assert.equal(b.replayPackets[0].naturalRevision, 1);
  b._attack(b.enemy, b.player, source, 1);
  b._replay(b.enemy, b.player, controller, source, 0.5);
  assert.equal(b.replayPackets[1].naturalRevision, 2);
});
test("duplicate validators share a single finite budget and piercing cannot spend it", () => {
  const b = make(true),
    { source, controller } = payload(b, 40, 0);
  for (let i = 0; i < 3; i++)
    b._replay(b.enemy, b.player, controller, source, 0.5);
  assert.equal(b.guardStats.player.prevented, 12);
  assert.equal(b.guardBudget.player, 0);
  assert.equal(b.player.hp, 152);
  const c = make(),
    parts = payload(c, 40, 1);
  c._replay(c.enemy, c.player, parts.controller, parts.source, 0.5);
  assert.equal(c.guardBudget.player, 12);
  assert.equal(c.player.hp, 180);
});
test("unselected prototype preserves actual canonical result and event traces", () => {
  assert.equal(typeof P?.ReplayGuardBattle, "function");
  const a = [
    C.makeItem("gov_rate_limit", "r", 24, 24, 280, 88),
    C.makeItem("go_lucky", "a", 24, 144, 208, 44),
  ];
  const b = [
    C.makeItem("gov_pdf", "p", 24, 24, 280, 48),
    C.makeItem("go_page", "e", 312, 24, 280, 36),
  ];
  const opts = { playerHp: 300, enemyHp: 300 };
  const normal = new E.Battle(a, b, opts),
    probe = new P.ReplayGuardBattle(a, b, opts, {
      config,
      slots: { player: [], enemy: [] },
    });
  while (!normal.result) assert.deepEqual(probe.step(0.05), normal.step(0.05));
  assert.deepEqual(probe.result, normal.result);
});
test("replay guard runs after429 and CDN while leaving the original piercing portion intact", () => {
  assert.equal(typeof P?.ReplayGuardBattle, "function");
  const a = [
    C.makeItem("gov_rate_limit", "guard", 24, 24, 280, 88),
    C.makeItem("gov_rate_limit", "rate", 312, 24, 280, 88),
  ];
  const b = [
    C.makeItem("gov_pdf", "pdf", 24, 24, 280, 48),
    C.makeItem("go_page", "echo", 312, 24, 280, 36),
  ];
  const f = new P.ReplayGuardBattle(
      a,
      b,
      { playerHp: 200, enemyHp: 200, playerAdmin: ["cdn"] },
      { config, slots: { player: ["guard"], enemy: [] } },
    ),
    parts = payload(f, 40, 0.5);
  f.rateBudget.player = 24;
  f.player.shield = 10;
  f._replay(f.enemy, f.player, parts.controller, parts.source, 1);
  assert.ok(Math.abs(f.guardStats.player.prevented - 4.76) < 1e-9);
  assert.ok(Math.abs(f.player.hp - 182.4) < 1e-9);
  assert.ok(Math.abs(f.player.shield - 1.16) < 1e-9);
});
test("shared budget refills continuously in fixed ticks and guard frame partition is invariant", () => {
  const a = make(true),
    p = payload(a, 40, 0);
  for (let i = 0; i < 3; i++)
    a._replay(a.enemy, a.player, p.controller, p.source, 0.5);
  for (let i = 0; i < 20; i++) a.step(0.05);
  assert.ok(Math.abs(a.guardBudget.player - 12) < 1e-9);
  const run = (dt) => {
    const f = make();
    while (!f.result) f.step(dt);
    return {
      result: f.result,
      hp: f.player.hp,
      budget: f.guardBudget,
      stats: f.guardStats,
      packets: f.replayPackets,
    };
  };
  assert.deepEqual(run(0.05), run(0.2));
});
