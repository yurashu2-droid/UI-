import test from "node:test";
import assert from "node:assert/strict";
import { simulateStoryPath } from "../scripts/story-progression-benchmark.ts";
import C from "../src/document.ts";
import R from "../src/run.ts";
import * as S from "../src/story/session.ts";

function accepted(result) {
  assert.equal(result.ok, true, result.error);
  const session = JSON.parse(JSON.stringify(result.session));
  assert.equal(S.validateStorySession(session), true);
  return session;
}

function settle(session, matchId) {
  const prepared = S.prepareStoryBattle(session, matchId);
  assert.equal(prepared.ok, true, prepared.error);
  const started = accepted(prepared);
  for (let i = 0; i < 5000 && !prepared.battle.result; i++) {
    prepared.battle.step(0.05);
  }
  assert.ok(prepared.battle.result);
  const result = S.settleStoryBattle(started, matchId, prepared.battle);
  return { session: accepted(result), summary: result.summary };
}

// A causal control for the finite witness, not another population/endings count.
// Controls fork from one settled loss; they are not spliced into the success path.
test("QA: paid story recovery keeps the real loss and changes only two owned positions, while unchanged and seekbar-only retries fail", () => {
  const route = simulateStoryPath(101, "mixed", {
    recovery: "seed-101-instant-navigation",
  });
  const { beforeLoss, afterLoss, beforeRetry } = route.recovery;
  const lossId = afterLoss.story.resolvedMatches.at(-1);
  const actualLoss = settle(beforeLoss, lossId);
  assert.equal(actualLoss.summary.winner, "enemy");
  assert.deepEqual(actualLoss.session, afterLoss);
  assert.equal(afterLoss.run.cash, beforeLoss.run.cash + actualLoss.summary.total);
  assert.equal(afterLoss.run.lives, beforeLoss.run.lives - 1);
  assert.equal(afterLoss.run.cash, 121);
  assert.equal(afterLoss.run.lives, 2);
  assert.deepEqual(afterLoss.run.admin, []);
  assert.equal(R.capacity(afterLoss.run), 49);

  const expected = structuredClone(afterLoss);
  assert.equal(expected.run.owned.find(p => p.id === "p9").type, "am_newsletter");
  assert.equal(expected.run.owned.find(p => p.id === "p24").type, "go_instant");
  assert.equal(R.move(expected.run, "p24", 592, 16), false);
  assert.deepEqual(expected, afterLoss, "occupied destination is rejected without mutation");
  for (const [id, x, y] of [["p9", 592, 472], ["p24", 592, 16]]) {
    const coordinateOnly = structuredClone(expected.run);
    Object.assign(coordinateOnly.owned.find(p => p.id === id), { x, y });
    assert.equal(R.move(expected.run, id, x, y), true);
    assert.deepEqual(expected.run, coordinateOnly);
  }
  assert.deepEqual(beforeRetry, expected, "no money, capacity, admin, ownership, size or story injection");
  assert.ok(beforeRetry.run.owned.filter(C.placed).every(p => C.canPlace(beforeRetry.run.owned, p, p.x, p.y)));
  assert.equal(C.analyze(beforeRetry.run.owned).load, C.analyze(afterLoss.run.owned).load);

  const unchanged = settle(afterLoss, "qa-paid-recovery-unchanged");
  assert.equal(unchanged.summary.winner, "enemy");
  assert.equal(unchanged.session.run.lives, 1);
  const seekbarRun = structuredClone(afterLoss.run);
  assert.equal(R.move(seekbarRun, "p20", 544, 424), true);
  const seekbar = settle(accepted(S.updateStoryBuild(afterLoss, seekbarRun)), "qa-paid-recovery-seekbar");
  assert.equal(seekbar.summary.winner, "draw");
  assert.equal(seekbar.session.run.lives, 1);
});
