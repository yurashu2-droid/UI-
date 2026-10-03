import test from "node:test";
import assert from "node:assert/strict";
import C from "../src/document.js";
import E from "../src/engine.js";
import R from "../src/run.js";
import { compositionProgress } from "../scripts/paid-composition.js";
import { comparePaidBridgeCleanup } from "../scripts/paid-bridge-cleanup-benchmark.js";

let report;
const getReport = () => (report ??= comparePaidBridgeCleanup());

// Removing an owned item, moving a target item, rewriting cash/admin/capacity,
// or reconstructing a different opponent/HP slice must invalidate the evidence.
test("bridge cleanup replays the paid snapshots and only moves non-target items into hand", () => {
  const r = getReport();
  assert.deepEqual(r.seeds, [103, 113, 115, 126, 208]);
  assert.equal(r.rows.length, 12);
  assert.equal(r.rulesVersion, "combat-v4");
  assert.equal(R.labEnemies().length, 42);
  assert.equal(R.labEnemies()[35].id, "site_trello");
  assert.equal(R.labEnemies()[36].id, "site_gmail");
  assert.equal(R.labEnemies()[37].id, "site_calendar");
  assert.equal(R.labEnemies()[38].id, "site_figma");
  assert.equal(R.labEnemies()[39].id, "site_slack");
  assert.equal(R.labEnemies()[40].id, "site_notion");
  assert.equal(R.labEnemies()[41].id, "site_pinterest");
  for (const path of r.paths)
    assert.equal(
      path.cash,
      10 + path.rewards - path.partSpend - path.serverSpend - path.rerollSpend,
    );
  for (const row of r.rows) {
    assert.equal(row.baseline.winner, row.source.winner);
    assert.equal(row.baseline.time, row.source.time);
    assert.deepEqual(row.baseline.board, row.source.board);
    const ownedTypes = new Map();
    for (const t of row.transactions.filter(
      (t) => t.kind === "buy" || t.kind === "loot",
    )) {
      assert.ok(t.offered.includes(t.type));
      if (!t.type.startsWith("plan:") && !t.type.startsWith("admin:"))
        ownedTypes.set(t.type, (ownedTypes.get(t.type) ?? 0) + 1);
    }
    assert.deepEqual(
      [...ownedTypes].sort(),
      [
        ...row.source.board.reduce(
          (m, p) => m.set(p.type, (m.get(p.type) ?? 0) + 1),
          new Map(),
        ),
      ].sort(),
    );
    for (const variant of row.variants) {
      assert.equal(variant.cash, row.source.cash);
      assert.equal(variant.capacity, row.source.capacity);
      assert.deepEqual(variant.admin, row.source.admin);
      assert.equal(variant.maxHp, row.baseline.maxHp);
      assert.deepEqual(variant.opponent, row.baseline.opponent);
      assert.equal(variant.board.length, row.source.board.length);
      assert.equal(variant.load, E.analyze(variant.board).load);
      assert.ok(
        compositionProgress(variant.board, r.target).targetLayoutComplete,
      );
      for (const p of row.source.board) {
        const after = variant.board.find((q) => q.id === p.id);
        assert.deepEqual(
          after,
          variant.heldIds.includes(p.id) ? { ...p, x: null, y: null } : p,
        );
      }
      assert.ok(
        variant.board
          .filter(C.placed)
          .every((p) => C.canPlace(variant.board, p, p.x, p.y, p.w, p.h)),
      );
    }
  }
});

// Treating all non-target UI as useless, granting capacity, or presenting these
// single-battle counterfactuals as a better full campaign would break this claim.
test("holding the guestbook helps every overloaded witness but hurts after paid capacity increases", () => {
  const r = getReport();
  const first = r.rows.filter((row) => row.firstCompletion);
  assert.equal(first.length, 5);
  const bySeed = new Map([
    [103, [112.1, 156.6, 12.4]],
    [113, [77.3, 131.9, 13.6]],
    [115, [113.096, 161.672, 13.6]],
    [126, [101.3, 149.9, 13.6]],
    [208, [77.3, 131.9, 13.6]],
  ]);
  for (const row of first) {
    const guestbook = row.variants.find((v) => v.policy === "hold-guestbook");
    const all = row.variants.find((v) => v.policy === "hold-all-bridge");
    const [beforeHp, afterHp, afterTime] = bySeed.get(row.seed);
    assert.equal(row.source.round, 6);
    assert.deepEqual(
      [row.baseline.load, guestbook.load, all.load, guestbook.capacity],
      [15, 12, 9, 12],
    );
    assert.ok(Math.abs(row.baseline.playerHp - beforeHp) < 1e-8);
    assert.ok(Math.abs(guestbook.playerHp - afterHp) < 1e-8);
    assert.ok(Math.abs(guestbook.time - afterTime) < 1e-8);
    assert.equal(row.baseline.winner, "player");
    assert.equal(guestbook.winner, "player");
    assert.ok(guestbook.playerHp > all.playerHp);
    assert.ok(all.playerHp > row.baseline.playerHp);
    assert.equal(guestbook.lag, 1);
    assert.equal(guestbook.lagLoss, 0);
    assert.ok(row.baseline.lag > 1 && row.baseline.lagLoss > 0);
  }
  for (const row of r.rows.filter((row) => row.source.capacity === 26)) {
    const guestbook = row.variants.find((v) => v.policy === "hold-guestbook");
    assert.equal(row.baseline.lag, 1);
    assert.equal(guestbook.winner, row.baseline.winner);
    assert.ok(guestbook.margin < row.baseline.margin);
  }
  assert.ok(
    r.rows.every((row) =>
      row.variants.every((v) => v.winner === row.baseline.winner),
    ),
  );
});
