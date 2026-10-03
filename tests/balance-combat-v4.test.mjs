import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import C from "../src/document.js";
import E from "../src/engine.js";
import {
  BATTLE_RULES_VERSION,
  SUPPORTED_COMBAT_VERSIONS,
} from "../src/combat-rules.js";
import { OneClickAblationBattle } from "../scripts/experiments/oneclick-ablation.js";

const items = (n) =>
  Array.from({ length: n }, (_, i) =>
    C.makeItem(
      "am_oneclick",
      `one${i}`,
      16 + (i % 3) * 300,
      16 + Math.floor(i / 3) * 160,
      128,
      40,
    ),
  );
const foe = () => [
  C.makeItem("gov_pdf", "pdf", 16, 16, 184, 40),
  C.makeItem("gov_font", "font", 16, 64, 208, 32),
];
function finish(b) {
  const events = [];
  while (!b.result) events.push(...b.step(0.05));
  return {
    events,
    result: b.result,
    metrics: b.metrics,
    income: b.player.income,
    hp: b.player.hp,
    enemyHp: b.enemy.hp,
  };
}

test("combat-v4 is default and retains explicit combat-v2/v3 selection", () => {
  assert.equal(BATTLE_RULES_VERSION, "combat-v4");
  assert.deepEqual(SUPPORTED_COMBAT_VERSIONS, [
    "combat-v2",
    "combat-v3",
    "combat-v4",
  ]);
  assert.equal(new E.Battle([], []).combatVersion, "combat-v4");
});
test("v4 inherits v3 navigation without re-enabling unlimited whitespace", () => {
  const board = Array.from({ length: 8 }, (_, i) =>
    C.makeItem("ab_link", `link${i}`, 24, 24 + i * 60, 192, 32),
  );
  assert.deepEqual(
    E.analyze(board, null, "combat-v4"),
    E.analyze(board, null, "combat-v3"),
  );
});
test("production v4 exactly matches the audited v3 repeat-clock probe across copy counts and overload", () => {
  for (const n of [1, 2, 3, 4, 6])
    for (const capacity of [12, 35])
      for (const hp of [220, 440]) {
        const a = items(n),
          b = foe(),
          opts = {
            playerHp: hp,
            enemyHp: hp,
            playerCapacity: capacity,
            enemyCapacity: capacity,
            playerAdmin: ["server", "backup"],
          };
        a.push(C.makeItem("am_oneclick", "held", null, null));
        const production = new E.Battle(a, b, opts),
          probe = new OneClickAblationBattle(
            a,
            b,
            { ...opts, combatVersion: "combat-v3" },
            { repeatCadence: { freeCopies: 2, extraWeight: 0.25 } },
          );
        assert.deepEqual(production.player.parts, probe.player.parts);
        assert.deepEqual(finish(production), finish(probe));
      }
});
test("v4 analyzed natural interval includes pagewide contention and CPU lag, while routed conversion is unchanged", () => {
  assert.equal(typeof E.naturalPeriod, "function");
  const a = items(4),
    b = foe(),
    opts = { playerHp: 1000, enemyHp: 1000, playerCapacity: 8 };
  const v4 = new E.Battle(a, b, opts),
    v3 = new E.Battle(a, b, { ...opts, combatVersion: "combat-v3" });
  const info = E.analyze(a);
  assert.equal(info.oneClickContention.entries, 4);
  assert.equal(info.oneClickContention.slowdown, 1.5);
  assert.match(info.mods.one0.notes.join(" "), /自然.*1.50/);
  for (const p of v4.player.parts)
    assert.equal(E.naturalPeriod(p, info, 8), p.period);
  for (const battle of [v3, v4]) {
    battle.player.income = 40;
    const p = battle.player.parts[0];
    p.charge = 6;
    battle.pendingHits = [];
    battle._convert(battle.player, battle.enemy, p);
    const queue = battle.pendingHits;
    battle.pendingHits = null;
    queue.forEach((f) => f());
  }
  assert.equal(v4.enemy.hp, v3.enemy.hp);
  assert.equal(v4.player.income, v3.player.income);
  assert.deepEqual(v4.metrics, v3.metrics);
});
test("twenty-eight v4 golden cases reproduce audited probe hashes under explicit and default selection", () => {
  const hash = (value) =>
    createHash("sha256").update(JSON.stringify(value)).digest("hex");
  const fixture = JSON.parse(
    readFileSync(new URL("./fixtures/combat-v4.json", import.meta.url), "utf8"),
  );
  assert.equal(fixture.cases.length, 28);
  for (const sample of fixture.cases) {
    assert.equal(hash(sample.input), sample.inputHash);
    const source = JSON.parse(
      readFileSync(
        new URL(`./fixtures/${sample.sourceFixture}`, import.meta.url),
        "utf8",
      ),
    );
    assert.ok(source.cases.some((c) => c.inputHash === sample.sourceInputHash));
    for (const combatVersion of [undefined, "combat-v4"]) {
      const b = new E.Battle(
          sample.input.playerBoard,
          sample.input.enemyBoard,
          { ...sample.input.options, combatVersion },
        ),
        events = [];
      while (!b.result) events.push(...b.step(0.05));
      assert.deepEqual(
        {
          result: b.result,
          ticks: b.ticks,
          playerHp: b.player.hp,
          enemyHp: b.enemy.hp,
          eventsHash: hash(events),
          metricsHash: hash(b.metrics),
        },
        sample.expected,
        sample.key,
      );
    }
  }
});
