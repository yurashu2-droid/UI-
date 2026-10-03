import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import E from "../src/engine.ts";
import C from "../src/document.ts";
import D from "../src/data.ts";
import { STORY_STAGES } from "../src/story/index.ts";
const url = new URL("./fixtures/story-opener.json", import.meta.url);
test("story opener keeps paid, legal regression fixtures for candidate comparison", () => {
  assert.equal(existsSync(url), true, "story opener fixture exists");
  const fixture = JSON.parse(readFileSync(url, "utf8"));
  assert.equal(fixture.scenarios.length, 4);
  for (const scenario of fixture.scenarios) {
    const board = scenario.layout.map(([type, x, y, w, h], i) =>
      C.makeItem(type, `p${i}`, x, y, w, h),
    );
    assert.ok(
      board.every((p) => C.canPlace(board, p, p.x, p.y)),
      scenario.id,
    );
    assert.ok(
      board.reduce((n, p) => n + D.PARTS[p.type].price, 0) <= scenario.budget,
      scenario.id,
    );
    const foe = STORY_STAGES[0].encounters[scenario.encounterIndex].enemy;
    const enemy = foe.layout.map(([type, x, y, w, h], i) =>
      C.makeItem(type, `e${i}`, x, y, w, h),
    );
    const battle = new E.Battle(board, enemy, {
      playerHp: 180,
      enemyHp: foe.hp,
      playerAdmin: [],
      enemyAdmin: foe.admin,
      playerCapacity: 12,
    });
    while (!battle.result) battle.step(0.05);
    if (scenario.id === "starter")
      assert.equal(
        battle.result.winner,
        "player",
        "a paid simple starter clears the opening encounter",
      );
  }
});
