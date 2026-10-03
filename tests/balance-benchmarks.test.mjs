import test from "node:test";
import assert from "node:assert/strict";
import * as Lab from "../src/buildlab.js";
import { BUILDS } from "../src/builds.js";
const entrant = (id) => {
  const b = BUILDS.find((b) => b.id === id);
  return { ...b, build: true };
};
test("resource accounting prices fusion inputs rather than zero-price output", () => {
  assert.equal(typeof Lab.resources, "function");
  const r = Lab.resources([["am_oneclick", 24, 24, 208, 44]]);
  assert.equal(r.acquisitionValue, 12);
  assert.equal(r.load, 3);
});
test("controlled benchmark preserves common capacity and neutral administration", () => {
  assert.equal(typeof Lab.measureMatch, "function");
  const r = Lab.measureMatch(entrant("b_echo"), entrant("b_links"), {
    hp: 440,
    capacity: 24,
    adminSlots: 0,
  });
  assert.equal(r.conditions.capacity, 24);
  assert.equal(r.maxHpA, 440);
  assert.equal(r.maxHpB, 440);
  assert.ok(r.lagLossA > 0);
  assert.equal(r.lagLossB, 0);
});
test("benchmark stores timestamped output checkpoints and actual resource differences", () => {
  assert.equal(typeof Lab.measureMatch, "function");
  const r = Lab.measureMatch(entrant("b_fort"), entrant("b_fort"), {
    hp: 10000,
    capacity: 56,
    adminSlots: 0,
  });
  assert.deepEqual(
    r.checkpoints.map((c) => c.time),
    [5, 15, 30, 45],
  );
  assert.ok(r.checkpoints[0].a.hpDamage >= 0);
  assert.ok(r.resourcesA.acquisitionValue > 0);
  assert.equal(r.winner, "draw");
});
test("finished non-video archetypes no longer spend their budget on dead speed columns", () => {
  for (const id of ["b_links", "b_echo"]) {
    const b = BUILDS.find((b) => b.id === id);
    assert.ok(!b.layout.some((r) => r[0] === "yt_speed"), id);
    assert.equal(Lab.resources(b.layout).legal, true);
  }
});
test("post-fusion benchmarks preserve ingredient accounting and legal finished layouts", () => {
  assert.equal(typeof Lab.fusedEntrant, "function");
  for (const b of BUILDS) {
    const v = Lab.fusedEntrant({ ...b, build: true });
    assert.equal(
      Lab.resources(v.entrant.layout).acquisitionValue,
      Lab.resources(b.layout).acquisitionValue,
      b.id,
    );
    assert.equal(Lab.resources(v.entrant.layout).legal, true, b.id);
  }
});
test("experimental fortress counter replaces real acquisition and CPU budget", async () => {
  let mod;
  try {
    mod = await import("../src/balance-candidates.js");
  } catch {}
  assert.equal(typeof mod?.fortressCandidate, "function");
  const base = entrant("b_fort"),
    v = mod.fortressCandidate(base);
  const before = Lab.resources(base.layout),
    after = Lab.resources(v.layout);
  assert.equal(after.legal, true);
  assert.ok(after.acquisitionValue <= before.acquisitionValue);
  assert.ok(after.load <= before.load);
  assert.ok(v.layout.some((r) => r[0] === "gov_rate_limit"));
});
