import test from "node:test";
import assert from "node:assert/strict";
import { comparePaidRoutingChoice } from "../scripts/paid-routing-choice-benchmark.js";
const report = comparePaidRoutingChoice();
const near = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
const match = (
  route,
  opponent,
  { slice = "purchased", hp = 380, phase = "canonical" } = {},
) =>
  report.matches.find(
    (m) =>
      m.route === route &&
      m.opponent === opponent &&
      m.slice === slice &&
      m.hp === hp &&
      m.phase === phase,
  ).forward;

test("the routing decision preserves a genuinely acquired One-click, receipts and all nine paid items", () => {
  assert.equal(report.rulesVersion, "combat-v4");
  assert.equal(report.witness.seed, 110);
  assert.equal(report.witness.round, 6);
  assert.equal(report.witness.donorRound.winner, "enemy");
  assert.deepEqual(report.witness.fusion.inputIds, ["p8", "p10"]);
  assert.equal(report.witness.fusion.outputId, "p11");
  assert.deepEqual(report.witness.spending, {
    parts: 33,
    rerolls: 13,
    server: 6,
    total: 52,
  });
  assert.deepEqual(
    report.witness.receipts
      .filter((r) => ["p3", "p7", "p8", "p9", "p10"].includes(r.id))
      .map((r) => [r.id, r.type, r.kind, r.round, r.cost]),
    [
      ["p3", "ab_mail", "loot", 1, 0],
      ["p7", "ab_mail", "buy", 3, 4],
      ["p8", "am_buy", "buy", 4, 5],
      ["p9", "am_cart", "buy", 4, 7],
      ["p10", "am_cart", "loot", 4, 0],
    ],
  );
  for (const branch of Object.values(report.branches)) {
    assert.equal(branch.cash, 25);
    assert.equal(branch.capacity, 21);
    assert.deepEqual(branch.admin, ["cdn"]);
    assert.equal(branch.resources.acquisitionValue, 44);
    assert.equal(branch.resources.load, 15);
    assert.equal(branch.resources.footprint, 62752);
    assert.equal(branch.board.length, 9);
    assert.ok(branch.board.every((p) => p.x !== null && p.y !== null));
    assert.deepEqual(branch.resources.experimental, []);
    assert.equal(branch.resources.legal, true);
    assert.ok(!branch.board.some((p) => ["p8", "p10"].includes(p.id)));
    assert.ok(
      branch.board.some((p) => p.id === "p11" && p.type === "am_oneclick"),
    );
    const expected = structuredClone(report.witness.snapshot.board);
    expected.find((p) => p.id === "p7").routeTo = branch.board.find(
      (p) => p.id === "p7",
    ).routeTo;
    assert.deepEqual(branch.board, expected);
  }
  assert.equal(
    report.branches.pool.board.find((p) => p.id === "p7").routeTo,
    "p9",
  );
  assert.equal(
    report.branches.split.board.find((p) => p.id === "p7").routeTo,
    "p11",
  );
  assert.deepEqual(
    report.witness.routing.map((r) => [r.id, r.candidates]),
    [
      ["p3", ["p9"]],
      ["p7", ["p11", "p9"]],
    ],
  );
  assert.deepEqual(
    report.cohorts.map((c) => [
      c.firstSeed,
      c.seeds,
      c.exactCompletions,
      c.blocked,
    ]),
    [
      [101, 30, 9, 0],
      [201, 10, 2, 0],
    ],
  );
});

test("routing alone pools charge sooner or splits it into the stronger consumer, with both seats and clocks conserved", () => {
  for (const m of report.matches) {
    assert.deepEqual(m.forward, m.reverse);
    assert.equal(m.seatConsistent, true);
    const paired = report.matches.find(
      (x) =>
        x.route !== m.route &&
        x.opponent === m.opponent &&
        x.slice === m.slice &&
        x.hp === m.hp &&
        x.phase === m.phase,
    );
    assert.deepEqual(m.forward.start, paired.forward.start);
    for (const side of ["subject", "opponent"]) {
      const delta = m.phase === `${side}-delayed` ? 0.75 : 0;
      for (const p of m.forward.start[side])
        near(p.remaining - p.canonical, p.period ? delta : 0);
    }
  }
  const pool = match("pool", "native-fortress"),
    split = match("split", "native-fortress");
  assert.equal(pool.winner, "subject");
  near(pool.subject.hp, 13.28);
  assert.equal(split.winner, "opponent");
  near(split.opponent.hp, 1);
  assert.equal(pool.subject.income, 16);
  assert.equal(split.subject.income, 16);
  assert.equal(pool.subject.metrics.spent, 15);
  assert.equal(split.subject.metrics.spent, 12);
  assert.equal(pool.subject.remainingCharge, 1);
  assert.equal(split.subject.remainingCharge, 4);
  near(pool.conversions.find((e) => e.action === "spend").time, 2.65);
  near(split.conversions.find((e) => e.action === "spend").time, 7.85);
  assert.deepEqual(pool.income, split.income);
  const linkPool = match("pool", "twelve-links"),
    linkSplit = match("split", "twelve-links");
  assert.equal(linkPool.winner, "opponent");
  near(linkPool.opponent.hp, 10);
  assert.equal(linkSplit.winner, "subject");
  near(linkSplit.subject.hp, 17.84);
  assert.deepEqual(linkPool.income, linkSplit.income);
  assert.equal(linkPool.subject.income, 12);
  assert.equal(linkSplit.subject.income, 12);
});

test("cheaper defeats, provisioned fortress and relative-start failures bound the paid routing witness", () => {
  assert.deepEqual(
    report.opponents.map((o) => [
      o.id,
      o.resources.acquisitionValue,
      o.resources.load,
      o.admin,
    ]),
    [
      ["native-fortress", 74, 32, []],
      ["twelve-links", 36, 12, []],
      ["supported-four", 23, 7, []],
    ],
  );
  for (const route of ["pool", "split"]) {
    for (const slice of ["purchased", "provisioned-reference"]) {
      for (const hp of [220, 300, 380, 440])
        for (const phase of [
          "canonical",
          "subject-delayed",
          "opponent-delayed",
        ])
          assert.equal(
            match(route, "supported-four", { slice, hp, phase }).winner,
            "opponent",
          );
    }
    assert.equal(
      match(route, "native-fortress", { slice: "provisioned-reference" })
        .winner,
      "opponent",
    );
    assert.equal(
      match(route, "native-fortress", { slice: "provisioned-reference" })
        .opponent.lag,
      1,
    );
    assert.equal(
      match(route, "native-fortress", { slice: "provisioned-reference" })
        .subject.capacity,
      32,
    );
    assert.equal(
      match(route, "native-fortress", { phase: "subject-delayed" }).winner,
      "opponent",
    );
  }
  assert.ok(match("pool", "native-fortress").opponent.lag > 1);
  assert.equal(match("pool", "native-fortress").subject.capacity, 21);
  near(
    match("pool", "native-fortress", { slice: "provisioned-reference" })
      .opponent.hp,
    236,
  );
  near(
    match("split", "native-fortress", { slice: "provisioned-reference" })
      .opponent.hp,
    226,
  );
  assert.equal(
    match("split", "twelve-links", { phase: "subject-delayed" }).winner,
    "draw",
  );
  assert.equal(
    match("split", "native-fortress", { phase: "opponent-delayed" }).winner,
    "subject",
  );
});
