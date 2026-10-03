import test from "node:test";
import assert from "node:assert/strict";
import { simulateStoryPath } from "../scripts/story-progression-benchmark.ts";
import C from "../src/document.ts";
import { STORY_STAGES } from "../src/story/content.ts";

function verifyLedger(route) {
  assert.equal(route.blocked, null);
  assert.equal(
    route.cash,
    11 - route.purchases - route.rerollSpend + route.earnings,
  );
  assert.ok(route.rounds.every((round) => round.cashAtBattle >= 0));
  for (const round of route.rounds) {
    const board = round.board.map(([type, x, y, w, h], i) =>
      C.makeItem(type, `p${i}`, x, y, w, h),
    );
    assert.ok(
      board.every((p) => C.canPlace(board, p, p.x, p.y)),
      round.encounter,
    );
    assert.equal(C.analyze(board).load, round.load);
    assert.ok(round.capacity >= 12);
  }
}

// Restoring the old ten-UI, three-admin stage-two boss makes this regression fail.
// This is a bounded progression goal, not a demand that arbitrary builds always win.
test("paid starter routes can pass the stage-two teaching boss without exhausting their lives", () => {
  for (const policy of ["navigation", "commerce", "mixed"]) {
    const route = simulateStoryPath(102, policy);
    verifyLedger(route);
    assert.equal(
      route.rounds.find((r) => r.encounter === "salvage-personal").winner,
      "player",
    );
    assert.equal(
      route.rounds.find((r) => r.encounter === "salvage-fast").winner,
      "player",
    );
    assert.equal(
      route.fusionAt,
      "delivery-store",
      "guaranteed real recipe is available before either stage-two battle",
    );
    assert.ok(
      route.wins >= 4,
      `${policy} must reach stage three through real paid acquisitions`,
    );
    assert.ok(route.records.includes("server-contract"));
  }
});

test("two paid acquisition policies reach all eight records and the ending", () => {
  for (const policy of ["commerce", "mixed"]) {
    const route = simulateStoryPath(130, policy);
    verifyLedger(route);
    assert.equal(route.complete, true, `${policy}: ${route.stage}`);
    assert.equal(route.wins, 15);
    assert.deepEqual(
      route.records,
      STORY_STAGES.map((stage) => stage.record.id),
    );
    assert.ok(
      route.serverSpend > 0,
      "capacity must be purchased rather than injected",
    );
    assert.ok(
      route.transactions.some((t) => t.type === "buy" && t.item === "am_cart"),
    );
  }
});

test("real fusion history unlocks the finale when its tutorial UI is no longer equipped", () => {
  const route = simulateStoryPath(130, "mixed", {
    retireTutorialFusionBeforeFinal: true,
  });
  verifyLedger(route);
  assert.equal(route.complete, true);
  const finale = route.rounds.find(
    (round) => round.encounter === "last-browser-whiteout",
  );
  assert.equal(finale.winner, "player");
  assert.ok(finale.held.includes("am_newsletter"));
  assert.equal(
    finale.board.some((row) => row[0] === "am_newsletter"),
    false,
  );
});

test("a paid mixed route reaches the ending without acquiring Cart or its fusion", () => {
  const route = simulateStoryPath(130, "mixed", { excludedTypes: ["am_cart"] });
  verifyLedger(route);
  assert.equal(route.complete, true);
  assert.equal(route.wins, 15);
  assert.equal(
    route.finalInventory.some((type) =>
      ["am_cart", "am_oneclick"].includes(type),
    ),
    false,
  );
  assert.equal(
    route.transactions.some((transaction) => transaction.item === "am_cart"),
    false,
  );
});

test("paid story acquisition and battle ledger reproduce for the same seed", () => {
  assert.deepEqual(
    simulateStoryPath(130, "mixed"),
    simulateStoryPath(130, "mixed"),
  );
});
