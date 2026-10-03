import test from "node:test";
import assert from "node:assert/strict";
import { simulateNavigationRecovery } from "../scripts/navigation-recovery.ts";

test("navigation seed 101 retains its paid first loss and reaches the actual ending", () => {
  const route = simulateNavigationRecovery();
  assert.equal(route.complete, true);
  assert.equal(route.finalSession.story.completedEncounters.length, 15);
  assert.equal(route.finalSession.story.restoredVisits, 1);
  assert.equal(
    route.rounds.filter((round) => round.winner !== "player").length,
    1,
  );
  assert.equal(route.finalSession.run.cash, 196);
});

import D from "../src/data.ts";
import C from "../src/document.ts";
import R from "../src/run.ts";
import E from "../src/engine.ts";
import * as S from "../src/story/session.ts";
import { STORY_STAGES } from "../src/story/content.ts";
import { simulateStoryPath } from "../scripts/story-progression-benchmark.ts";

const accept = (result) => {
  assert.equal(result.ok, true, result.error);
  const session = JSON.parse(JSON.stringify(result.session));
  assert.equal(S.validateStorySession(session), true);
  return session;
};
function retry(session, id) {
  const prepared = S.prepareStoryBattle(session, id);
  assert.equal(prepared.ok, true, prepared.error);
  for (let i = 0; i < 5000 && !prepared.battle.result; i++)
    prepared.battle.step(0.05);
  assert.ok(prepared.battle.result);
  const settled = S.settleStoryBattle(prepared.session, id, prepared.battle);
  return {
    session: accept(settled),
    summary: settled.summary,
    enemyHp: prepared.battle.enemy.hp,
  };
}

test("the navigation recovery preserves its baseline prefix, loss settlement and full cash ledger", () => {
  const route = simulateNavigationRecovery();
  const baseline = simulateStoryPath(101, "navigation");
  const keys = [
    "encounter",
    "winner",
    "seconds",
    "hp",
    "cashAtBattle",
    "cashAfter",
    "lifeAfter",
    "load",
    "capacity",
    "board",
    "reward",
  ];
  for (let i = 0; i < 11; i++)
    for (const key of keys)
      assert.deepEqual(
        route.rounds[i][key],
        baseline.rounds[i][key],
        `prefix ${i} ${key}`,
      );
  assert.equal(route.beforeLoss.run.cash, 92);
  assert.equal(route.beforeLoss.run.lives, 3);
  assert.equal(C.analyze(route.beforeLoss.run.owned).load, 31);
  assert.equal(route.afterLoss.run.cash, 108);
  assert.equal(route.afterLoss.run.lives, 2);
  assert.equal(route.afterLoss.run.owned.length, 17);
  assert.equal(
    route.afterLoss.run.owned.find((p) => p.id === "p21").type,
    "ab_blog",
  );
  assert.deepEqual(route.afterLoss.run.admin, []);
  assert.equal(route.purchases, 50);
  assert.equal(route.rerollSpend, 18);
  assert.equal(route.earnings, 253);
  assert.equal(
    route.finalSession.run.cash,
    11 - route.purchases - route.rerollSpend + route.earnings,
  );
  assert.deepEqual(
    route.transactions.slice(-2).map((t) => [t.item, t.cost]),
    [
      ["go_result", 6],
      ["am_rating", 4],
    ],
  );
  assert.deepEqual(
    route.finalSession.story.records,
    STORY_STAGES.map((stage) => stage.record.id),
  );
});

test("the recovery only moves one previously owned part and preserves capacity through the ending", () => {
  const route = simulateNavigationRecovery();
  const before = route.afterLoss.run;
  const proof = route.beforeProof.run;
  for (const original of before.owned) {
    const expected =
      original.id === "p1" ? { ...original, x: 32, y: 384 } : original;
    assert.deepEqual(
      proof.owned.find((p) => p.id === original.id),
      expected,
    );
  }
  assert.deepEqual(
    proof.owned.slice(17).map(({ type, x, y, w, h }) => [type, x, y, w, h]),
    [
      ["go_result", 32, 272, 260, 80],
      ["gov_breadcrumb", null, null, 560, 28],
      ["am_rating", 512, 96, 280, 32],
    ],
  );
  assert.equal(R.capacity(proof), 35);
  assert.equal(C.analyze(proof.owned).load, 34);
  assert.equal(R.capacity(route.finalSession.run), 35);
  assert.deepEqual(route.finalSession.run.admin, []);
  assert.deepEqual(
    route.rounds.slice(12).map((r) => r.board),
    Array(4).fill(route.rounds[12].board),
  );
  assert.deepEqual(
    route.rounds.slice(12).map((r) => r.hp),
    [9, 318, 289, 155],
  );
  assert.deepEqual(
    route.rounds.slice(12).map((r) => r.reward),
    ["gov_breadcrumb", "gov_form", "gov_form", "go_search"],
  );
  const analysis = E.analyze(proof.owned);
  assert.ok(analysis.freeRatio > 0.6);
  assert.equal(analysis.mods.p12.power, 1.2);
  assert.equal(analysis.mods.p14.power, 1.2);
  assert.deepEqual(analysis.navigation.highlightedLinks, ["p2", "p4"]);
  assert.equal(analysis.navigation.entries, 6);
});

test("unchanged retries and the first purchase alone do not establish a full recovery", () => {
  const route = simulateNavigationRecovery();
  const unchanged = retry(route.afterLoss, "navigation-control-unchanged");
  assert.equal(unchanged.summary.winner, "enemy");
  assert.equal(unchanged.enemyHp, 21);
  assert.equal(unchanged.session.run.lives, 1);
  const proof = accept(
    S.claimStoryReward(route.afterDeskRetry, "gov_breadcrumb"),
  );
  const onePurchase = retry(proof, "navigation-control-one-purchase");
  assert.equal(onePurchase.summary.winner, "enemy");
  assert.equal(onePurchase.enemyHp, 16);
});

test("the same review expenditure fails when its placement misses the commerce attacks", () => {
  const route = simulateNavigationRecovery();
  const run = structuredClone(route.beforeProof.run);
  const review = run.owned.find((p) => p.type === "am_rating");
  assert.ok(review);
  assert.equal(R.move(run, review.id, 608, 304), true);
  const edited = accept(S.updateStoryBuild(route.beforeProof, run));
  assert.equal(edited.run.cash, route.beforeProof.run.cash);
  assert.equal(R.capacity(edited.run), 35);
  assert.equal(E.analyze(edited.run.owned).mods.p12.power, 1);
  assert.equal(E.analyze(edited.run.owned).mods.p14.power, 1);
  assert.equal(
    retry(edited, "navigation-control-disconnected-review").summary.winner,
    "enemy",
  );
});

test("oversizing the search result consumes whitespace and invalidates this narrow recovery", () => {
  const route = simulateNavigationRecovery();
  const run = structuredClone(route.beforeProof.run);
  const result = run.owned.find((p) => p.type === "go_result");
  assert.equal(D.PARTS[result.type].minW, 260);
  assert.equal(R.move(run, result.id, 32, 272, 280, 96), true);
  assert.ok(C.analyze(run.owned).freeRatio < 0.6);
  const edited = accept(S.updateStoryBuild(route.beforeProof, run));
  assert.equal(
    retry(edited, "navigation-control-larger-result").summary.winner,
    "enemy",
  );
});
