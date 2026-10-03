import test from "node:test";
import assert from "node:assert/strict";
import C from "../src/document.js";
import E from "../src/engine.js";
let P;
try {
  P = await import("../scripts/experiments/oneclick-ablation.js");
} catch {}
const boards = () => [
  [C.makeItem("am_oneclick", "one", 24, 24, 208, 44)],
  [C.makeItem("ab_heading", "enemy", 24, 24, 420, 56)],
];
test("oneclick conversion ablation changes only conversion output and spends the same charge", () => {
  assert.equal(typeof P?.OneClickAblationBattle, "function");
  const [a, b] = boards(),
    fight = new P.OneClickAblationBattle(
      a,
      b,
      { playerHp: 200, enemyHp: 200 },
      { conversion15: true },
    );
  const p = fight.player.parts[0];
  p.charge = 3;
  fight._convert(fight.player, fight.enemy, p);
  assert.equal(fight.enemy.hp, 185);
  assert.equal(p.charge, 0);
  fight._attack(fight.player, fight.enemy, p, 1);
  assert.equal(fight.enemy.hp, 173);
});
test("queued conversion is scaled exactly once and empty ablation is canonical", () => {
  assert.equal(typeof P?.OneClickAblationBattle, "function");
  const [a, b] = boards(),
    fight = new P.OneClickAblationBattle(
      a,
      b,
      { playerHp: 200, enemyHp: 200 },
      { conversion15: true },
    );
  const p = fight.player.parts[0];
  p.charge = 3;
  fight.pendingHits = [];
  fight._convert(fight.player, fight.enemy, p);
  const hits = fight.pendingHits;
  fight.pendingHits = null;
  hits.forEach((f) => f());
  assert.equal(fight.enemy.hp, 185);
  const original = new E.Battle(a, b, { playerHp: 200, enemyHp: 200 }),
    none = new P.OneClickAblationBattle(
      a,
      b,
      { playerHp: 200, enemyHp: 200 },
      {},
    );
  while (!original.result)
    assert.deepEqual(none.step(0.05), original.step(0.05));
  assert.deepEqual(none.result, original.result);
});
test("income-growth ablation leaves the natural base and actual income ledger intact", () => {
  const [a, b] = boards();
  const fight = new P.OneClickAblationBattle(
    a,
    b,
    { playerHp: 200, enemyHp: 200 },
    { noIncomeGrowth: true },
  );
  fight.player.income = 40;
  fight._attack(fight.player, fight.enemy, fight.player.parts[0], 1);
  assert.equal(fight.enemy.hp, 188);
  assert.equal(fight.player.income, 40);
});
test("repeat-cadence probe preserves one/two copies and changes only natural clocks beyond them", () => {
  for (const count of [1, 2, 4]) {
    const a = Array.from({ length: count }, (_, i) =>
      C.makeItem("am_oneclick", `one${i}`, 24 + i * 208, 24, 208, 44),
    );
    const b = boards()[1],
      opts = { playerHp: 200, enemyHp: 200, combatVersion: "combat-v3" };
    const original = new E.Battle(a, b, opts),
      probe = new P.OneClickAblationBattle(a, b, opts, {
        repeatCadence: { freeCopies: 2, extraWeight: 0.2 },
      });
    const ratio = 1 + 0.2 * Math.max(0, count - 2);
    assert.equal(probe.player.load, original.player.load);
    assert.ok(
      Math.abs(
        probe.player.parts[0].period / original.player.parts[0].period - ratio,
      ) < 1e-9,
    );
    assert.ok(
      Math.abs(
        probe.player.parts[0].remaining / original.player.parts[0].remaining -
          ratio,
      ) < 1e-9,
    );
    const p = probe.player.parts[0];
    p.charge = 3;
    probe._convert(probe.player, probe.enemy, p);
    assert.equal(probe.enemy.hp, 180);
    assert.equal(p.charge, 0);
  }
});
