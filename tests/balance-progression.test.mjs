import { simulatePath } from "../scripts/progression-benchmark.js";
import test from "node:test";
import assert from "node:assert/strict";
let Probe;
try {
  Probe = await import("../scripts/progression-benchmark.js");
} catch {}
test("progression probes replay identical acquisition choices from fixed seed", () => {
  assert.equal(typeof Probe?.simulatePath, "function");
  const a = Probe.simulatePath(101, "pressure"),
    b = Probe.simulatePath(101, "pressure");
  assert.deepEqual(a, b);
  assert.ok(a.rounds.length > 0);
  assert.ok(a.rounds.every((r) => r.adminSlots <= 2));
});
test("progression ledger reconciles purchases, rerolls, rewards and final wealth", () => {
  assert.equal(typeof Probe?.simulatePath, "function");
  const a = Probe.simulatePath(102, "economy");
  assert.equal(a.cash, 10 + a.rewards - a.purchases - a.rerollCost);
  assert.ok(a.rounds.every((r) => r.payoutIncome <= 10));
  assert.ok(a.rounds.every((r) => r.legal));
});
test("candidate offer is explicitly experimental and paid after its price tier unlocks", () => {
  const a = Probe.simulatePath(101, "guard", { candidateOffer: true });
  assert.equal(a.experimentalOffer, true);
  const offered = a.rounds.filter((r) => r.offeredCandidate);
  assert.ok(offered.length > 0);
  assert.ok(offered.every((r) => r.round >= 4));
  assert.ok(a.rounds.some((r) => r.choices.includes("gov_rate_limit")));
  assert.equal(a.cash, 10 + a.rewards - a.purchases - a.rerollCost);
});
test("priced piercing alternative uses the same scripted offer opportunity", () => {
  const a = Probe.simulatePath(101, "guard", {
    candidateOffer: true,
    candidatePart: "gov_pdf",
  });
  assert.equal(a.candidatePart, "gov_pdf");
  assert.ok(a.rounds.some((r) => r.choices.includes("gov_pdf")));
  assert.ok(
    a.rounds.every((r) => r.board.every((p) => p.type !== "gov_rate_limit")),
  );
  assert.equal(a.cash, 10 + a.rewards - a.purchases - a.rerollCost);
});
test("candidate path comparison is reproducible with a bounded fixed-seed command", async () => {
  let tool;
  try {
    tool = await import("../scripts/candidate-progression.js");
  } catch {}
  assert.equal(typeof tool?.compareAcquisitionPaths, "function");
  const r = tool.compareAcquisitionPaths(101, 1);
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].seed, 101);
  assert.ok(r.rows[0].limiterVsPressure.length > 0);
  assert.ok(r.rows[0].limiterVsPiercing.length > 0);
});

test("navigation pursuit measures paid rerolls rather than catalogue-floor duplicate prices", () => {
  const row = simulatePath(103, "navigation");
  assert.ok(row.rerollCost > 0);
  assert.ok(
    Math.max(
      ...row.rounds.map(
        (r) =>
          r.board.filter((p) => ["ab_link", "ab_nav"].includes(p.type)).length,
      ),
    ) >= 12,
  );
  assert.equal(row.blocked, null);
});
test("experimental acquisition paths use real combat and restore the canonical battle factory", async () => {
  const { default: E } = await import("../src/engine.js");
  const factory = E.Battle;
  const base = simulatePath(103, "navigation", {combatVersion:"combat-v2"});
  const candidate = simulatePath(103, "navigation", {
    experimentalRules: "navigation-v1",
  });
  assert.equal(candidate.experimentalRules, "navigation-v1");
  assert.equal(E.Battle, factory);
  assert.notDeepEqual(
    candidate.rounds.map((r) => [r.winner, r.time]),
    base.rounds.map((r) => [r.winner, r.time]),
  );
  assert.ok(candidate.rounds.every((r) => r.legal));
});
