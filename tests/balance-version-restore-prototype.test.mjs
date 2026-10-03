import test from "node:test";
import assert from "node:assert/strict";
import C from "../src/document.js";
import E from "../src/engine.js";
let P;
try {
  P = await import("../scripts/experiments/version-restore.js");
} catch {}
const config = {
  fraction: 0.5,
  cap: 12,
  cooldown: 3,
  includePierce: false,
  zeroClears: true,
};
const boards = () => [
  [C.makeItem("gov_notice", "restore", 24, 536, 560, 56)],
  [C.makeItem("gov_pdf", "pdf", 24, 24, 240, 48)],
];
test("restore prototype consumes the shared actual-loss record once and excludes original piercing", () => {
  assert.equal(typeof P?.VersionRestoreBattle, "function");
  const [a, b] = boards(),
    fight = new P.VersionRestoreBattle(
      a,
      b,
      { playerHp: 100, enemyHp: 100 },
      { config, slots: { player: ["restore"], enemy: [] } },
    );
  fight._hit(fight.enemy, fight.player, fight.enemy.parts[0], 20, 0.5);
  assert.equal(fight.player.hp, 80);
  fight._activate(fight.player, fight.enemy, fight.player.parts[0]);
  assert.equal(fight.player.hp, 85);
  fight._activate(fight.player, fight.enemy, fight.player.parts[0]);
  assert.equal(fight.player.hp, 85);
});
test("shielded zero hits clear history only for the explicitly selected rule", () => {
  assert.equal(typeof P?.VersionRestoreBattle, "function");
  for (const zeroClears of [true, false]) {
    const [a, b] = boards(),
      f = new P.VersionRestoreBattle(
        a,
        b,
        { playerHp: 100, enemyHp: 100 },
        {
          config: { ...config, zeroClears },
          slots: { player: ["restore"], enemy: [] },
        },
      );
    f._hit(f.enemy, f.player, f.enemy.parts[0], 20, 0);
    f.player.shield = 10;
    f._hit(f.enemy, f.player, f.enemy.parts[0], 3, 0);
    f._activate(f.player, f.enemy, f.player.parts[0]);
    assert.equal(f.player.hp, zeroClears ? 80 : 90);
  }
});
test("restore never revives, samples administrator damage, or heals during overload", () => {
  assert.equal(typeof P?.VersionRestoreBattle, "function");
  const [a, b] = boards(),
    f = new P.VersionRestoreBattle(
      a,
      b,
      { playerHp: 100, enemyHp: 100 },
      { config, slots: { player: ["restore"], enemy: [] } },
    );
  f._hit(f.enemy, f.player, { damage: 0 }, 20, 1, "troll");
  f._activate(f.player, f.enemy, f.player.parts[0]);
  assert.equal(f.player.hp, 80);
  f._hit(f.enemy, f.player, f.enemy.parts[0], 200, 0);
  f._activate(f.player, f.enemy, f.player.parts[0]);
  assert.equal(f.player.hp, 0);
  f.player.hp = 50;
  f._hit(f.enemy, f.player, f.enemy.parts[0], 20, 0);
  f.ticks = 900;
  f.elapsed = 45;
  f._activate(f.player, f.enemy, f.player.parts[0]);
  assert.equal(f.player.hp, 30);
});
test("an unselected prototype instance preserves the canonical event trace", () => {
  assert.equal(typeof P?.VersionRestoreBattle, "function");
  const [a, b] = boards(),
    opts = { playerHp: 100, enemyHp: 100 };
  const normal = new E.Battle(a, b, opts),
    prototype = new P.VersionRestoreBattle(a, b, opts, {
      config,
      slots: { player: [], enemy: [] },
    });
  while (!normal.result) {
    assert.deepEqual(prototype.step(0.05), normal.step(0.05));
  }
  assert.deepEqual(prototype.result, normal.result);
});
test("empty restore polling emits no fake activation or advertising revenue", () => {
  const [a, b] = boards();
  a.push(C.makeItem("ad_retarget", "ad", 592, 536, 280, 80));
  const f = new P.VersionRestoreBattle(
    a,
    b,
    { playerHp: 100, enemyHp: 100 },
    { config, slots: { player: ["restore"], enemy: [] } },
  );
  const restore = f.player.parts.find((p) => p.id === "restore");
  f._activate(f.player, f.enemy, restore);
  assert.equal(restore.fires, 0);
  assert.equal(f.player.income, 0);
  f._hit(f.enemy, f.player, f.enemy.parts[0], 20, 0);
  f._activate(f.player, f.enemy, restore);
  assert.equal(restore.fires, 1);
  assert.equal(f.player.income, 1);
});
test("continuing after45 only restores qualifying UI loss and does not sample overload", () => {
  const [a, b] = boards(),
    f = new P.VersionRestoreBattle(
      a,
      b,
      { playerHp: 100, enemyHp: 100 },
      {
        config: { ...config, stopAtOverload: false },
        slots: { player: ["restore"], enemy: [] },
      },
    );
  f.ticks = 901;
  f.elapsed = 45.05;
  f._hit(f.enemy, f.player, f.enemy.parts[0], 20, 0);
  f._activate(f.player, f.enemy, f.player.parts[0]);
  assert.equal(f.player.hp, 90);
});
test("restore comparison reports equivalent paid notice resources and both seats", async () => {
  let bench;
  try {
    bench = await import("../scripts/version-restore-benchmark.js");
  } catch {}
  assert.equal(typeof bench?.compareRestoreCase, "function");
  const r = bench.compareRestoreCase("b_fort_native", "b_cart", config, 440);
  assert.equal(r.resources.cost, 79);
  assert.equal(r.resources.load, 34);
  assert.equal(r.seatConsistent, true);
  assert.equal(r.variant, "restore");
});
test("real UI-origin retarget attacks remain eligible even when their visual event uses an admin label", () => {
  const [a, b] = boards();
  b.push(C.makeItem("ad_retarget", "retarget", 300, 24, 280, 80));
  const f = new P.VersionRestoreBattle(
    a,
    b,
    { playerHp: 100, enemyHp: 100 },
    {
      config: { ...config, includePierce: true },
      slots: { player: ["restore"], enemy: [] },
    },
  );
  f._hit(
    f.enemy,
    f.player,
    f.enemy.parts.find((p) => p.id === "retarget"),
    10,
    1,
    "troll",
  );
  f._activate(f.player, f.enemy, f.player.parts[0]);
  assert.equal(f.player.hp, 95);
});
test("duplicate restore controls do not clone a page loss or its advertising trigger", () => {
  const a = [
    C.makeItem("gov_notice", "r1", 24, 24, 280, 112),
    C.makeItem("gov_notice", "r2", 312, 24, 280, 112),
    C.makeItem("ad_retarget", "ad", 24, 144, 280, 80),
    C.makeItem("am_cart", "cart", 24, 232, 280, 100),
  ];
  const b = [C.makeItem("go_lucky", "hit", 24, 24, 208, 44)];
  const f = new P.VersionRestoreBattle(
    a,
    b,
    { playerHp: 100, enemyHp: 100 },
    { config, slots: { player: ["r1", "r2"], enemy: [] } },
  );
  f._hit(f.enemy, f.player, f.enemy.parts[0], 30, 0);
  for (const p of f.player.parts.filter((p) => p.type === "gov_notice"))
    f._activate(f.player, f.enemy, p);
  assert.equal(f.player.hp, 82);
  assert.equal(f.restoreStats.player.consumed, 1);
  assert.equal(f.player.income, 1);
  assert.equal(f.player.parts.find((p) => p.type === "am_cart").charge, 1);
});
test("a later chip replaces the burst revision and a stale revision expires", () => {
  const [a, b] = boards(),
    f = new P.VersionRestoreBattle(
      a,
      b,
      { playerHp: 100, enemyHp: 100 },
      { config, slots: { player: ["restore"], enemy: [] } },
    );
  f._hit(f.enemy, f.player, f.enemy.parts[0], 30, 0);
  f._hit(f.enemy, f.player, f.enemy.parts[0], 2, 0);
  f._activate(f.player, f.enemy, f.player.parts[0]);
  assert.equal(f.player.hp, 69);
  f._hit(f.enemy, f.player, f.enemy.parts[0], 20, 0);
  f.ticks = 101;
  f._activate(f.player, f.enemy, f.player.parts[0]);
  assert.equal(f.player.hp, 49);
});
test("restore battles preserve mirror fairness and fixed-tick frame partition", () => {
  const layout = [
    C.makeItem("gov_notice", "r", 24, 104, 280, 112),
    C.makeItem("go_lucky", "a", 24, 24, 208, 44),
  ];
  const options = { playerHp: 400, enemyHp: 400 };
  const run = (dt) => {
    const f = new P.VersionRestoreBattle(layout, layout, options, {
      config,
      slots: { player: ["r"], enemy: ["r"] },
    });
    while (!f.result) f.step(dt);
    return {
      result: f.result,
      hpA: f.player.hp,
      hpB: f.enemy.hp,
      metrics: f.metrics,
      stats: f.restoreStats,
    };
  };
  const fine = run(0.05),
    coarse = run(0.2);
  assert.deepEqual(fine, coarse);
  assert.equal(fine.result.winner, "draw");
  assert.equal(fine.hpA, fine.hpB);
});
