import test from "node:test";
import assert from "node:assert/strict";
import E from "../src/engine.js";
import { board } from "../src/buildlab.js";
import { DEFAULT_LIMITS, assessCandidate, adminChoices, duel, refineRemovals, runSearch } from "../scripts/open-build-search.js";
import { adminResponseMatrix } from "../scripts/open-build-robustness.js";

const candidate = (id, layout, admin = []) => ({ id, origin: "independent-qa", layout, admin });
const pdf = candidate("pdf", [["gov_pdf", 16, 16, 184, 40]]);
const link = candidate("link", [["ab_link", 16, 16, 96, 24]]);

test("QA admission maxLoad does not silently raise actual battle capacity or suppress overload", () => {
  const limits = { ...DEFAULT_LIMITS, capacity: 2, maxLoad: 3 };
  assert.equal(assessCandidate(pdf, limits).legal, true);
  const battle = new E.Battle(board(pdf.layout, "a"), board(link.layout, "b"), {
    playerHp: 440, enemyHp: 440, playerCapacity: limits.capacity, enemyCapacity: limits.capacity,
  });
  assert.equal(battle.player.load, 3);
  assert.equal(battle.player.capacity, 2);
  assert.equal(battle.player.lag, 1.3);
  while (!battle.result) battle.step(.05);
  const searched = duel(pdf, link, limits);
  assert.equal(searched.time, battle.elapsed);
  assert.equal(searched.hpA, battle.player.hp);
  assert.equal(searched.hpB, battle.enemy.hp);
});

test("QA search rejects unknown parts, overlapping controls, out-of-bounds and unplaced items", () => {
  for (const layout of [
    [["unknown", 16, 16, 96, 24]],
    [["ab_link", 16, 16, 96, 24], ["ab_link", 20, 16, 96, 24]],
    [["ab_link", 900, 650, 96, 24]],
    [["ab_link", null, null, 96, 24]],
  ]) assert.equal(assessCandidate(candidate("invalid", layout), DEFAULT_LIMITS).legal, false);
});

test("QA all two-slot admin choices are unique unordered distinct actual pairs", () => {
  const choices = adminChoices(2);
  assert.equal(choices.length, 36);
  assert.equal(new Set(choices.map(a => [...a].sort().join("/"))).size, 36);
  for (const admin of choices) {
    assert.equal(new Set(admin).size, 2);
    assert.equal(assessCandidate({ ...link, admin }, DEFAULT_LIMITS).legal, true);
  }
  assert.deepEqual(adminChoices(0), [[]]);
});

test("QA conservative removal cannot trade away an opponent-specific strength", () => {
  const mixed = candidate("specialist", [["ab_link", 16, 16, 96, 24], ["gov_pdf", 16, 80, 184, 40]]);
  const evaluate = c => ({ candidate: c, resources: assessCandidate(c, DEFAULT_LIMITS),
    margins: c.layout.length === 2 ? [.2, .1] : c.layout[0][0] === "ab_link" ? [.5, 0] : [.1, .5] });
  const result = refineRemovals(evaluate(mixed), evaluate, DEFAULT_LIMITS);
  assert.deepEqual(result.removed, []);
  assert.deepEqual(result.row.candidate.layout, mixed.layout);
});

test("QA exact admin matrix checks both choice axes and derives each side's minimax correctly", () => {
  const result = adminResponseMatrix(pdf, link, DEFAULT_LIMITS);
  assert.equal(result.comparisons, 1296);
  assert.equal(result.margins.length, 36);
  assert.ok(result.margins.every(row => row.length === 36));
  const bestA = Math.max(...result.margins.map(row => Math.min(...row)));
  const bestB = Math.max(...result.choices.map((_, i) => Math.min(...result.margins.map(row => -row[i]))));
  assert.equal(result.bestA.worstMargin, bestA);
  assert.equal(result.bestB.worstMargin, bestB);
  assert.equal(result.aCanBeatEveryAdmin, result.margins.some(row => row.every(m => m > 1e-9)));
  assert.equal(result.bCanBeatEveryAdmin, result.choices.some((_, i) => result.margins.every(row => -row[i] > 1e-9)));
  assert.equal(result.seatChecked, 36);
  assert.deepEqual(result.seatMismatches, []);
});

test("QA the full bounded search report is deterministic, including ranking and refinement", () => {
  const limits = { ...DEFAULT_LIMITS, budget: 9, capacity: 4, hp: 40, adminSlots: 0 };
  const a = runSearch(765, limits, 6), b = runSearch(765, limits, 6);
  assert.deepEqual(a, b);
  assert.ok(a.finalists.length > 0);
  assert.ok(a.finalists.every(row => assessCandidate(row.candidate, limits).legal));
  assert.deepEqual(a.seatMismatches, []);
});
