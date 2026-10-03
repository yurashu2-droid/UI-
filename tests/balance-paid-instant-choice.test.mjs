import test from "node:test";
import assert from "node:assert/strict";
import * as B from "../scripts/paid-instant-choice-benchmark.js";
const report = B.comparePaidInstantChoice();

// This catches granting the output, consuming another owned pair, dropping paid
// bridge UI, or silently borrowing free server capacity for the fusion decision.
test("the matched Instant Search choice consumes the exact paid round-five donors", () => {
  assert.equal(report.rulesVersion, "combat-v4");
  assert.equal(report.witness.seed, 130);
  assert.equal(report.witness.round, 5);
  assert.deepEqual(report.witness.inputIds, ["p8", "p9"]);
  assert.equal(report.witness.outputId, "p11");
  const acquired = report.path.transactions.filter(
    (t) =>
      (t.kind === "buy" && t.round <= 5 && !t.type.startsWith("plan:")) ||
      (t.kind === "loot" && t.round < 5 && !t.type.startsWith("admin:")),
  );
  assert.ok(acquired.every((t) => t.offered.includes(t.type)));
  assert.deepEqual(
    report.witness.source.board.map((p) => [p.id, p.type]),
    acquired.map((t, i) => ["p" + (i + 1), t.type]),
  );
  assert.deepEqual(
    acquired.find((t) => t.type === "go_search") && [
      acquired.find((t) => t.type === "go_search").kind,
      acquired.find((t) => t.type === "go_search").round,
      acquired.find((t) => t.type === "go_search").cost,
    ],
    ["buy", 4, 6],
  );
  assert.deepEqual(
    acquired.find((t) => t.type === "go_suggest") && [
      acquired.find((t) => t.type === "go_suggest").kind,
      acquired.find((t) => t.type === "go_suggest").round,
    ],
    ["loot", 4],
  );
  assert.deepEqual(report.witness.spending, {
    parts: 29,
    rerolls: 11,
    server: 0,
    total: 40,
  });
  const { hold, merge } = report.branches;
  assert.equal(hold.cash, 16);
  assert.equal(merge.cash, hold.cash);
  assert.deepEqual(merge.admin, hold.admin);
  assert.equal(merge.capacity, hold.capacity);
  assert.equal(merge.capacity, 12);
  assert.equal(hold.resources.acquisitionValue, 40);
  assert.equal(merge.resources.acquisitionValue, 40);
  assert.equal(hold.resources.load, 15);
  assert.equal(merge.resources.load, 13);
  assert.equal(hold.resources.footprint, 75200);
  assert.equal(merge.resources.footprint, 72640);
  assert.equal(merge.navigationAttacks, 6);
  assert.equal(report.supported.capacity, 17);
  assert.ok(hold.board.some((p) => p.id === "p8" && p.type === "go_search"));
  assert.ok(hold.board.some((p) => p.id === "p9" && p.type === "go_suggest"));
  assert.ok(merge.board.some((p) => p.id === "p11" && p.type === "go_instant"));
  assert.ok(!merge.board.some((p) => ["p8", "p9"].includes(p.id)));
  for (const part of hold.board.filter((p) => !["p8", "p9"].includes(p.id)))
    assert.deepEqual(
      merge.board.find((p) => p.id === part.id),
      part,
    );
  assert.deepEqual(hold.bridgeIds, ["p1", "p3", "p5"]);
  assert.deepEqual(merge.bridgeIds, hold.bridgeIds);
});

// This catches reporting only the target's $29 while deleting the $11 bridge,
// conflating material value with cash spend, or presenting inputs as completion.
test("the ordinary equal-value alternative retains its own paid inventory and acquisition cost", () => {
  assert.ok(
    report.ordinary,
    "a separately acquired ordinary alternative is recorded",
  );
  assert.equal(report.ordinary.seed, 130);
  assert.equal(report.ordinary.round, 7);
  assert.equal(report.ordinary.spending.total, 46);
  assert.equal(report.ordinary.snapshot.resources.acquisitionValue, 40);
  assert.equal(report.ordinary.snapshot.resources.load, 14);
  assert.equal(report.ordinary.snapshot.capacity, 12);
  assert.equal(report.ordinary.snapshot.board.length, 11);
  assert.equal(report.ordinary.snapshot.resources.footprint, 84928);
  assert.equal(report.ordinary.snapshot.navigationAttacks, 8);
  assert.equal(report.ordinary.spending.parts, 29);
  assert.equal(report.ordinary.spending.rerolls, 17);
  assert.equal(report.ordinary.spending.server, 0);
  assert.ok(report.ordinary.snapshot.board.every((p) => p.x !== null));
  assert.deepEqual(report.ordinary.snapshot.admin, report.branches.merge.admin);
  assert.equal(report.cohorts.length, 4);
  assert.ok(report.cohorts.every((c) => c.blocked === 0));
  assert.deepEqual(
    report.cohorts.map((c) => [c.exactCompletions, c.round8]),
    [
      [10, 19],
      [0, 3],
      [4, 17],
      [0, 3],
    ],
  );
});

// This catches testing only a friendly seat/HP, silently making every clock
// canonical again, or clearing the paid CPU overload in the actual-capacity slice.
test("the paid choices use both seats, three HP levels and explicit relative-start stress", () => {
  assert.ok(report.matches?.length, "the matched choices are actually fought");
  assert.deepEqual(
    [...new Set(report.matches.map((m) => m.hp))],
    [220, 300, 440],
  );
  assert.deepEqual(
    [...new Set(report.matches.map((m) => m.slice))],
    ["core", "whole", "purchased"],
  );
  assert.deepEqual(
    [...new Set(report.matches.map((m) => m.phase))],
    ["canonical", "subject-delayed", "opponent-delayed"],
  );
  assert.ok(report.matches.every((m) => m.seatConsistent));
  for (const m of report.matches) {
    assert.equal(m.forward.winner, m.reverse.winner);
    assert.equal(m.forward.time, m.reverse.time);
    assert.equal(m.forward.margin, m.reverse.margin);
    const subjectDelta = m.phase === "subject-delayed" ? 0.75 : 0;
    const opponentDelta = m.phase === "opponent-delayed" ? 0.75 : 0;
    for (const p of m.forward.start.subject.filter((p) => p.period > 0))
      assert.ok(Math.abs(p.remaining - p.canonical - subjectDelta) < 1e-9);
    for (const p of m.forward.start.opponent.filter((p) => p.period > 0))
      assert.ok(Math.abs(p.remaining - p.canonical - opponentDelta) < 1e-9);
  }
  const actual = report.matches.find(
    (m) => m.slice === "purchased" && m.a === "merge" && m.b === "hold",
  );
  assert.equal(actual.forward.subject.load, 13);
  assert.equal(actual.forward.opponent.load, 15);
  assert.ok(actual.forward.subject.lag > 1);
  assert.ok(actual.forward.opponent.lag > actual.forward.subject.lag);
  const result = (slice, hp, a, b, phase = "canonical") =>
    report.matches.find(
      (m) =>
        m.slice === slice &&
        m.hp === hp &&
        m.a === a &&
        m.b === b &&
        m.phase === phase,
    ).forward;
  for (const hp of [300, 440]) {
    assert.equal(result("core", hp, "merge", "hold").winner, "draw");
    assert.equal(result("core", hp, "merge", "ordinary").winner, "opponent");
    assert.equal(result("whole", hp, "merge", "ordinary").winner, "subject");
  }
  for (const hp of [220, 300, 440])
    assert.equal(
      result("purchased", hp, "merge", "ordinary").winner,
      "subject",
    );
  assert.equal(
    result("purchased", 220, "merge", "ordinary", "subject-delayed").winner,
    "opponent",
  );
  assert.equal(
    result("purchased", 300, "merge", "hold", "subject-delayed").winner,
    "opponent",
  );
  assert.equal(
    result("whole", 300, "merge", "ordinary", "subject-delayed").winner,
    "opponent",
  );
});
