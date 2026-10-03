import test from "node:test";
import assert from "node:assert/strict";
import { simulateStoryPath } from "../scripts/story-progression-benchmark.ts";
import { STORY_STAGES } from "../src/story/content.ts";

test("seed 101 keeps its first loss then reaches the actual ending through two owned-UI moves", () => {
  const route = simulateStoryPath(101, "mixed", {
    recovery: "seed-101-instant-navigation",
  });
  assert.equal(route.complete, true);
  assert.equal(route.wins, 15);
  assert.equal(route.losses, 1);
  assert.equal(route.rounds.length, 16);
  assert.equal(route.rounds[11].encounter, "permission-proof");
  assert.equal(route.rounds[11].winner, "enemy");
  assert.equal(route.rounds[12].winner, "player");
  assert.equal(route.rounds[12].seconds, 19.75);
  assert.equal(route.rounds[12].hp, 29);
  assert.equal(route.cash, 199);
  assert.equal(
    route.cash,
    11 - route.purchases - route.rerollSpend + route.earnings,
  );
  assert.deepEqual(
    route.records,
    STORY_STAGES.map((stage) => stage.record.id),
  );
});

import D from "../src/data.ts";
import C from "../src/document.ts";
import R from "../src/run.ts";
import * as S from "../src/story/session.ts";

const recover = () =>
  simulateStoryPath(101, "mixed", {
    recovery: "seed-101-instant-navigation",
  });
function accept(result) {
  assert.equal(result.ok, true, result.error);
  const session = JSON.parse(JSON.stringify(result.session));
  assert.equal(S.validateStorySession(session), true);
  return session;
}
function retry(input, id) {
  const prepared = S.prepareStoryBattle(input, id);
  assert.equal(prepared.ok, true, prepared.error);
  for (let i = 0; i < 5000 && !prepared.battle.result; i++)
    prepared.battle.step(0.05);
  assert.ok(prepared.battle.result);
  const result = S.settleStoryBattle(prepared.session, id, prepared.battle);
  return {
    session: accept(result),
    summary: result.summary,
    enemyHp: prepared.battle.enemy.hp,
  };
}

test("the recovery preserves the paid prefix and holds later loot off the unchanged repaired board", () => {
  const baseline = simulateStoryPath(101, "mixed");
  const route = recover();
  assert.equal(baseline.complete, false);
  assert.equal(baseline.losses, 3);
  assert.deepEqual(route.rounds.slice(0, 12), baseline.rounds.slice(0, 12));
  assert.deepEqual(
    route.transactions,
    baseline.transactions.slice(0, route.transactions.length),
  );
  assert.equal(route.purchases, 76);
  assert.equal(route.rerollSpend, 19);
  assert.equal(route.earnings, 283);
  assert.deepEqual(
    route.rounds.slice(12).map((r) => r.board),
    Array(4).fill(route.rounds[12].board),
  );
  assert.deepEqual(
    route.rounds.slice(12).map((r) => r.reward),
    ["gov_breadcrumb", "gov_form", "gov_form", "go_search"],
  );
  assert.equal(route.finalSession.story.restoredVisits, 1);
  assert.equal(route.finalSession.story.phase, "complete");
});

test("two bounded purchases from the actual post-loss shop also give legal winning retries", () => {
  const { afterLoss } = recover().recovery;
  for (const type of ["go_result", "am_prime"]) {
    const run = structuredClone(afterLoss.run);
    assert.ok(run.shop.some((offer) => offer.type === type && !offer.sold));
    const purchase = R.purchase(run, type);
    assert.equal(purchase.ok, true);
    assert.ok(purchase.item);
    if (type === "am_prime") assert.equal(R.move(run, "p11", 320, 472), true);
    assert.equal(
      R.move(
        run,
        purchase.item.id,
        type === "am_prime" ? 320 : 32,
        type === "am_prime" ? 96 : 472,
        type === "am_prime" ? 192 : 280,
        D.PARTS[type].h,
      ),
      true,
    );
    assert.equal(run.cash, 121 - D.PARTS[type].price);
    assert.equal(R.capacity(run), 49);
    assert.ok(C.analyze(run.owned).load <= R.capacity(run));
    assert.deepEqual(
      run.owned.slice(0, afterLoss.run.owned.length).map(({ x, y, ...p }) => p),
      afterLoss.run.owned.map(({ x, y, ...p }) => p),
    );
    const result = retry(
      accept(S.updateStoryBuild(afterLoss, run)),
      `recovery-paid-${type}`,
    );
    assert.equal(result.summary.winner, "player");
    assert.equal(result.summary.hp, 29);
    assert.equal(result.session.run.cash, run.cash + result.summary.total);
  }
});

test("the fixed recovery witness cannot silently run on another path", () => {
  assert.throws(
    () =>
      simulateStoryPath(102, "mixed", {
        recovery: "seed-101-instant-navigation",
      }),
    /limited/,
  );
  assert.throws(
    () =>
      simulateStoryPath(101, "commerce", {
        recovery: "seed-101-instant-navigation",
      }),
    /limited/,
  );
  assert.throws(
    () =>
      simulateStoryPath(101, "mixed", {
        recovery: "seed-101-instant-navigation",
        layout: "modules",
      }),
    /limited/,
  );
});
