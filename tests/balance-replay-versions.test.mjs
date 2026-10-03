import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import E from "../src/engine.js";
import C from "../src/document.js";
import { BATTLE_RULES_VERSION } from "../src/combat-rules.js";
const hash = (x) =>
  createHash("sha256").update(JSON.stringify(x)).digest("hex");
test("new battles default to combat-v3 navigation while explicit combat-v2 remains unchanged", () => {
  const items = [0, 1, 2].map((i) =>
    C.makeItem("ab_link", "p" + i, 24, 24 + i * 80, 192, 32),
  );
  const current = new E.Battle(items, [], { playerHp: 1000, enemyHp: 1000 });
  const legacy = new E.Battle(items, [], {
    playerHp: 1000,
    enemyHp: 1000,
    combatVersion: "combat-v2",
  });
  assert.equal(BATTLE_RULES_VERSION, "combat-v3");
  assert.equal(current.combatVersion, "combat-v3");
  assert.equal(legacy.combatVersion, "combat-v2");
  current._activate(current.player, current.enemy, current.player.parts[2]);
  legacy._activate(legacy.player, legacy.enemy, legacy.player.parts[2]);
  assert.equal(current.enemy.hp, 996);
  assert.equal(legacy.enemy.hp, 993);
});
test("all twenty immutable combat-v2 replay event hashes still reproduce exactly", () => {
  const fixture = JSON.parse(
    readFileSync(new URL("./fixtures/combat-v2.json", import.meta.url), "utf8"),
  );
  for (const sample of fixture.cases) {
    assert.equal(hash(sample.input), sample.inputHash);
    const b = new E.Battle(sample.input.playerBoard, sample.input.enemyBoard, {
      ...sample.input.options,
      combatVersion: "combat-v2",
    });
    const events = [];
    while (!b.result) events.push(...b.step(0.05));
    assert.deepEqual(
      {
        result: b.result,
        ticks: b.ticks,
        playerHp: b.player.hp,
        enemyHp: b.enemy.hp,
        eventsHash: hash(events),
      },
      sample.expected,
      sample.key,
    );
  }
});
test("unknown rule versions cannot silently execute as current combat", () => {
  assert.throws(
    () => new E.Battle([], [], { combatVersion: "combat-unknown" }),
    /Unknown combat/,
  );
});
