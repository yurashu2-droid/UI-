import test from "node:test";
import assert from "node:assert/strict";
import { simulatePath } from "../scripts/progression-benchmark.js";
import D from "../src/data.js";
test("hypothetical history offer unlocks at the real $6 tier and its ledger charges that price", () => {
  const r = simulatePath(101, "guard", {
    candidateOffer: true,
    candidatePart: "go_history",
  });
  const offers = r.rounds.filter((s) => s.offeredCandidate);
  assert.ok(offers.length);
  assert.equal(offers[0].round, 3);
  assert.ok(r.rounds.some((s) => s.choices.includes("go_history")));
  assert.equal(D.PARTS.go_history.price, 6);
  assert.equal(D.PARTS.go_history.load, 2);
  assert.equal(r.cash, 10 + r.rewards - r.purchases - r.rerollCost);
  assert.ok(offers.every((s) => s.forgoneOffer));
  assert.equal(r.experimentalOffer, true);
});
test("ordinary notice comparison keeps its real lower cost rather than granting compensation", () => {
  const r = simulatePath(101, "guard", {
    candidateOffer: true,
    candidatePart: "gov_notice",
  });
  assert.ok(r.rounds.some((s) => s.choices.includes("gov_notice")));
  assert.equal(D.PARTS.gov_notice.price, 5);
  assert.equal(D.PARTS.gov_notice.load, 2);
  assert.equal(r.cash, 10 + r.rewards - r.purchases - r.rerollCost);
});
test("actual-family trial comparisons preserve native clocks and reported leftover budget", async () => {
  let B;
  try {
    B = await import("../scripts/history-trial-benchmark.js");
  } catch {}
  assert.equal(typeof B?.runHistoryCase, "function");
  const history = B.runHistoryCase(
    "b_documents_heavy",
    "b_cart",
    "go_history",
    440,
  );
  const notice = B.runHistoryCase(
    "b_documents_heavy",
    "b_cart",
    "gov_notice",
    440,
  );
  assert.equal(history.slot.cost, 6);
  assert.equal(notice.slot.cost, 5);
  assert.equal(history.slot.unspentFrom6, 0);
  assert.equal(notice.slot.unspentFrom6, 1);
  assert.equal(history.seatConsistent, true);
  assert.equal(notice.seatConsistent, true);
  assert.equal(history.slot.initialRemaining, history.slot.period * 0.5 * 0.75);
});
