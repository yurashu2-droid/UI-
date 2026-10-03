import test from "node:test";
import assert from "node:assert/strict";
import D from "../src/data.js";
import E from "../src/engine.js";
let S;
try {
  S = await import("../scripts/open-build-search.js");
} catch {}

const limits = {
  budget: 75,
  capacity: 26,
  hp: 440,
  adminSlots: 2,
  footprint: 960 * 680,
  productionOnly: true,
};
test("open search validates geometry, recipe price, CPU, footprint and unique actual admins", () => {
  assert.equal(typeof S?.assessCandidate, "function");
  const c = {
    id: "test",
    origin: "test",
    layout: [["gov_onestop", 16, 16, 136, 40]],
    admin: ["server", "backup"],
  };
  assert.equal(S.assessCandidate(c, limits).legal, true);
  assert.equal(S.assessCandidate(c, limits).cost, 9);
  for (const [candidate, bounds] of [
    [{ ...c, admin: ["server", "server"] }, limits],
    [{ ...c, admin: ["unknown"] }, limits],
    [{ ...c, layout: [["gov_onestop", 16, 16, 80, 40]] }, limits],
    [c, { ...limits, budget: 8 }],
    [c, { ...limits, capacity: 1 }],
    [c, { ...limits, footprint: 5000 }],
    [{ ...c, layout: [["gov_rate_limit", 16, 16, 280, 88]] }, limits],
  ])
    assert.equal(S.assessCandidate(candidate, bounds).legal, false);
});
test("every permitted fused part has a real selected public fusion witness and nonzero input value", () => {
  assert.equal(typeof S?.fusionWitness, "function");
  for (const type of S.catalogueTypes(limits).filter((t) => D.PARTS[t].fused)) {
    const w = S.fusionWitness(type);
    assert.equal(w.output, type);
    assert.equal(w.consumed.length, 2);
    assert.equal(w.donorLegal, true);
    assert.equal(w.fusions, 1);
    assert.ok(w.inputValue > 0);
    assert.equal(
      w.inputValue,
      S.assessCandidate(
        {
          id: type,
          origin: "test",
          layout: [[type, 0, 0, D.PARTS[type].w, D.PARTS[type].h]],
          admin: [],
        },
        limits,
      ).cost,
    );
  }
});
test("generated mutations are deterministic and legal rather than fixed archetypes", () => {
  assert.equal(typeof S?.generateCandidates, "function");
  const a = S.generateCandidates(123, limits, 80);
  const b = S.generateCandidates(123, limits, 80);
  assert.deepEqual(a, b);
  assert.ok(a.length >= 50);
  assert.ok(a.every((c) => S.assessCandidate(c, limits).legal));
  assert.ok(new Set(a.map((c) => S.compositionKey(c))).size > 30);
  assert.ok(new Set(a.flatMap((c) => c.layout.map((r) => r[0]))).size > 20);
});
test("Pareto pruning uses every opponent result as well as cost, CPU and footprint", () => {
  assert.equal(typeof S?.paretoFront, "function");
  const row = (id, cost, margins) => ({
    candidate: { id },
    resources: { cost, load: 10, footprint: 1000 },
    margins,
  });
  const out = S.paretoFront([
    row("a", 10, [1, 0]),
    row("b", 11, [1, 0]),
    row("c", 9, [0, 1]),
    row("d", 12, [1, -1]),
  ]);
  assert.deepEqual(out.map((r) => r.candidate.id).sort(), ["a", "c"]);
});
test("search duels preserve both-seat outcomes and their fixed resource conditions", () => {
  assert.equal(typeof S?.duel, "function");
  const [a, b] = S.generateCandidates(5, limits, 2);
  const f = S.duel(a, b, limits),
    r = S.duel(b, a, limits);
  assert.equal(f.margin, -r.margin);
  assert.equal(f.time, r.time);
  assert.equal(
    f.winner,
    r.winner === "a" ? "b" : r.winner === "b" ? "a" : "draw",
  );
});
test("isolated search battle injection is explicit and does not replace canonical engine rules", () => {
  const [a, b] = S.generateCandidates(31, limits, 2);
  let calls = 0;
  class CountingProbe extends E.Battle {
    constructor(...args) {
      super(...args);
      calls++;
    }
  }
  const original = S.duel(a, b, limits);
  assert.deepEqual(S.duel(a, b, limits, CountingProbe), original);
  assert.equal(calls, 1);
  assert.deepEqual(S.duel(a, b, limits), original);
  assert.equal(calls, 1);
});
test("battle capacity and admitted load can differ without pretending overload is forbidden", () => {
  const c = {
    id: "overload",
    origin: "test",
    layout: [["gov_pdf", 16, 16, 184, 40]],
    admin: [],
  };
  assert.equal(S.assessCandidate(c, { ...limits, capacity: 2 }).legal, false);
  assert.equal(
    S.assessCandidate(c, { ...limits, capacity: 2, maxLoad: 3 }).legal,
    true,
  );
});
test("conservative refinement removes an inert rating instead of calling the costlier board Pareto-optimal", () => {
  const c = {
    id: "rating",
    origin: "test",
    layout: [
      ["ab_link", 16, 16, 96, 24],
      ["am_rating", 600, 600, 160, 24],
    ],
    admin: [],
  };
  const opponent = {
    id: "foe",
    origin: "test",
    layout: [["gov_pdf", 16, 16, 184, 40]],
    admin: [],
  };
  const evaluate = (c) => ({
    candidate: c,
    resources: S.assessCandidate(c, limits),
    margins: [S.duel(c, opponent, limits).margin],
  });
  const result = S.refineRemovals(evaluate(c), evaluate, limits);
  assert.deepEqual(result.removed, [{ type: "am_rating", costSaved: 4 }]);
  assert.equal(result.row.resources.cost, 3);
});
