import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import D from "../src/data.js";
import E from "../src/engine.js";
import { board, resources } from "../src/buildlab.js";
import { runReachableCounter } from "../scripts/reachable-counter-benchmark.js";
import { assessCandidate, duel } from "../scripts/open-build-search.js";

const opponents = JSON.parse(
  readFileSync(
    new URL("../fixtures/balance/reachable-finalists.json", import.meta.url),
    "utf8",
  ),
).finalists.map(({ candidate }) => candidate);
const defense = {
  ...opponents.find((c) => c.id === "candidate-200912"),
  admin: [],
};

// Changing target selection, losing either shared support relation, or replacing
// the fixed no-admin comparison with the ordinary lab defaults must fail here.
test("four ordinary supported links counter the frozen defense with real support connections", () => {
  const report = runReachableCounter(111, 1, opponents, "supported-links");
  assert.equal(report.target.id, "supported-links");
  assert.deepEqual(report.target.admin, []);
  assert.equal(report.resources.acquisitionValue, 23);
  assert.equal(report.resources.load, 7);
  assert.equal(report.target.layout.length, 6);
  assert.ok(report.target.layout.every(([type]) => !D.PARTS[type].fused));
  assert.deepEqual(
    [
      report.conditions.hp,
      report.conditions.capacity,
      report.conditions.adminSlots,
    ],
    [300, 17, 0],
  );
  const candidate = { ...report.target, origin: "fixed-counter" };
  const parts = board(candidate.layout, "counter");
  const analysis = E.analyze(parts);
  for (const part of parts.filter((p) => p.type === "ab_link")) {
    assert.ok(Math.abs(analysis.mods[part.id].power - 2.1) < 1e-9);
    assert.ok(Math.abs(analysis.mods[part.id].speed - 1.3225) < 1e-9);
    for (const type of ["gov_font", "go_suggest"])
      assert.ok(
        analysis.relations.some(
          (r) =>
            r.from === parts.find((p) => p.type === type).id &&
            r.to === part.id,
        ),
      );
  }
  const match = report.matches.find((m) => m.opponent.id === defense.id);
  assert.equal(match.forward.winner, "a");
  assert.equal(match.reverse.winner, "b");
  assert.equal(match.forward.hpA, 20);
  assert.equal(match.forward.time, 10.25);
  assert.equal(report.summary.completedWins, 12);
  assert.equal(report.summary.seatMismatches, 0);
});

// The disconnection keeps every part, dimension, input price and CPU load.
// Removing the fourth link is a separately cheaper ablation, not an equal-cost one.
test("disconnecting either support or removing the fourth link loses the counter", () => {
  const report = runReachableCounter(111, 1, [], "supported-links");
  const base = { ...report.target, origin: "support-ablation" };
  for (const type of ["gov_font", "go_suggest"]) {
    const disconnected = {
      ...base,
      layout: base.layout.map((row) =>
        row[0] === type
          ? [row[0], row[1], type === "gov_font" ? 400 : 500, row[3], row[4]]
          : [...row],
      ),
    };
    assert.ok(assessCandidate(disconnected, report.conditions).legal);
    assert.equal(resources(disconnected.layout).acquisitionValue, 23);
    assert.equal(resources(disconnected.layout).load, 7);
    assert.equal(duel(disconnected, defense, report.conditions).winner, "b");
    assert.equal(duel(defense, disconnected, report.conditions).winner, "a");
  }
  const threeLinks = {
    ...base,
    layout: base.layout.filter(
      (_, i) => i !== base.layout.findLastIndex(([t]) => t === "ab_link"),
    ),
  };
  assert.equal(resources(threeLinks.layout).acquisitionValue, 20);
  assert.equal(duel(threeLinks, defense, report.conditions).winner, "b");
});

// A target-only win is insufficient: preserve all actual paid bridge items and
// distinguish whole-inventory input value from parts/rerolls/server cash spent.
test("the round-four paid counter retains every item and fits a $40 all-in spend cap", () => {
  const report = runReachableCounter(111, 1, [], "supported-links");
  const path = report.rows[0];
  const completion = report.completions[0];
  assert.equal(path.blocked, null);
  assert.equal(completion.round, 4);
  assert.deepEqual(
    [
      completion.partSpend,
      completion.rerollSpend,
      completion.serverSpend,
      completion.totalSpend,
    ],
    [26, 5, 0, 31],
  );
  assert.equal(completion.inventoryInputValue, 31);
  assert.deepEqual(
    [completion.inventorySize, completion.load, completion.capacity],
    [8, 11, 12],
  );
  assert.deepEqual(completion.actualAdmin, ["adnet"]);
  const reached = path.rounds.find((r) => r.targetLayoutComplete);
  assert.equal(reached.held, 0);
  assert.equal(reached.board.length, 8);
  assert.deepEqual(
    reached.board.map((p) => p.type).sort(),
    [
      "ab_link",
      "ab_link",
      "ab_link",
      "ab_link",
      "gov_font",
      "go_suggest",
      "ab_nav",
      "ab_guestbook",
    ].sort(),
  );
  const acquired = [];
  for (const transaction of path.transactions.filter(
    (t) =>
      (t.kind === "buy" && t.round <= reached.round) ||
      (t.kind === "loot" && t.round < reached.round),
  )) {
    assert.ok(transaction.offered.includes(transaction.type));
    if (D.PARTS[transaction.type]) acquired.push(transaction.type);
  }
  assert.deepEqual(acquired.sort(), reached.board.map((p) => p.type).sort());
  const actual = {
    id: "seed111-paid-board",
    origin: "paid",
    admin: [],
    layout: reached.board.map((p) => [p.type, p.x, p.y, p.w, p.h]),
  };
  assert.ok(assessCandidate(actual, report.conditions).legal);
  assert.equal(resources(actual.layout).acquisitionValue, 31);
  const forward = duel(actual, defense, report.conditions);
  const reverse = duel(defense, actual, report.conditions);
  assert.equal(forward.winner, "a");
  assert.equal(reverse.winner, "b");
  assert.equal(forward.hpA, 75.5);
  assert.equal(forward.time, 8.85);
  assert.equal(forward.time, reverse.time);
  assert.equal(forward.margin, -reverse.margin);
  assert.equal(
    path.cash,
    10 + path.rewards - path.partSpend - path.serverSpend - path.rerollSpend,
  );
  assert.ok(
    !path.transactions.some((t) => ["fusion", "sell"].includes(t.kind)),
  );
});
