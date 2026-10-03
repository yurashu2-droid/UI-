import test from "node:test";
import assert from "node:assert/strict";
import D from "../src/data.js";
import C from "../src/document.js";
import E from "../src/engine.js";
import { BUILDS } from "../src/builds.js";

const board = (layout, prefix) => layout.map(([type, x, y, w, h, shape, label], index) =>
  Object.assign(C.makeItem(type, prefix + index, x, y, w, h), shape ? { shape } : {}, label ? { label } : {}));

const states = (battle) => ({
  result: battle.result,
  ticks: battle.ticks,
  player: { hp: battle.player.hp, shield: battle.player.shield, income: battle.player.income,
    parts: battle.player.parts.map(p => ({ type:p.type, fires:p.fires, damage:p.damage, healed:p.healed, earned:p.earned })) },
  enemy: { hp: battle.enemy.hp, shield: battle.enemy.shield, income: battle.enemy.income,
    parts: battle.enemy.parts.map(p => ({ type:p.type, fires:p.fires, damage:p.damage, healed:p.healed, earned:p.earned })) },
});

function create(a, b, prefixes = ["p", "e"]) {
  return new E.Battle(board(a.layout, prefixes[0]), board(b.layout, prefixes[1]), {
    playerHp:440, enemyHp:440, playerAdmin:a.admin ?? [], enemyAdmin:b.admin ?? [],
    playerCapacity:200, enemyCapacity:200,
  });
}
function finish(battle, dt) {
  let n = 0;
  while (!battle.result && n++ < 5000) battle.step(dt);
  assert.ok(battle.result);
  return states(battle);
}

// A real capped-heal ordering regression: at 2.3 seconds, b_fort's guestbook
// healed the player by 0 but the enemy by 6 after same-tick PDF damage.
test("QA: identical fortress pages have symmetric per-tick combat state", () => {
  const fortress = BUILDS.find(b => b.id === "b_fort");
  assert.ok(fortress);
  const battle = create(fortress, fortress);
  while (!battle.result && battle.ticks < 1300) {
    battle.step(0.05);
    for (const key of ["hp", "shield", "income"])
      assert.ok(Math.abs(battle.player[key] - battle.enemy[key]) < 1e-7,
        `${key} differs at ${battle.elapsed}s: ${battle.player[key]} vs ${battle.enemy[key]}`);
  }
  assert.equal(battle.result?.winner, "draw");
});

test("QA: rendering frame partition does not change combat outcomes", () => {
  const defs = [...Object.values(D.PRESETS), ...BUILDS];
  for (let i = 0; i < defs.length; i++) {
    const a = defs[i], b = defs[(i + 1) % defs.length];
    assert.deepEqual(finish(create(a, b), 0.2), finish(create(a, b), 0.05), `pair ${i}: 0.2s`);
    assert.deepEqual(finish(create(a, b), 0.07), finish(create(a, b), 0.05), `pair ${i}: 0.07s`);
  }
});

test("QA: item identity labels do not change combat strength", () => {
  for (let i = 0; i < BUILDS.length; i++) {
    const a = BUILDS[i], b = BUILDS[(i + 1) % BUILDS.length];
    assert.deepEqual(finish(create(a, b, ["renamed-own-", "renamed-foe-"]), 0.05),
      finish(create(a, b), 0.05), a.id);
  }
});
