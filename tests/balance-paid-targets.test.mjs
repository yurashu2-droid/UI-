import test from "node:test";
import assert from "node:assert/strict";
import D from "../src/data.js";
let P;
try {
  P = await import("../scripts/paid-target-benchmark.js");
} catch {}
test("paid target routes reconcile the real campaign ledger without injected items or offers", () => {
  assert.equal(typeof P?.simulateTargetPath, "function");
  for (const policy of ["cart", "cart-fused", "fortress", "documents"]) {
    const a = P.simulateTargetPath(101, policy);
    assert.equal(
      a.cash,
      10 + a.rewards - a.partSpend - a.serverSpend - a.rerollSpend,
    );
    assert.ok(a.rounds.length > 0);
    assert.ok(a.rounds.every((r) => r.legal));
    assert.ok(
      a.transactions
        .filter((t) => t.kind === "buy")
        .every((t) => t.offered.includes(t.type)),
    );
    assert.ok(
      a.transactions
        .filter((t) => t.kind === "loot")
        .every((t) => t.offered.includes(t.type)),
    );
    assert.ok(
      a.rounds.every((r) =>
        r.board.every((p) => D.PARTS[p.type].status !== "experimental"),
      ),
    );
    assert.equal(a.blocked, null);
  }
});
test("fixed-seed paid targets are deterministic and report missing composition inputs", () => {
  assert.equal(typeof P?.simulateTargetPath, "function");
  const a = P.simulateTargetPath(103, "documents");
  assert.deepEqual(a, P.simulateTargetPath(103, "documents"));
  assert.ok(
    a.rounds.every(
      (r) =>
        Number.isInteger(r.targetFilled) && r.targetFilled <= r.targetTotal,
    ),
  );
  assert.ok(a.rounds.every((r) => r.missing.every((m) => m.count > 0)));
});
test("fusion branches account for consumed paid inputs rather than granting fused parts", () => {
  assert.equal(typeof P?.simulateTargetPath, "function");
  const rows = Array.from({ length: 5 }, (_, i) =>
    P.simulateTargetPath(101 + i, "cart-fused"),
  );
  assert.ok(
    rows.flatMap((r) => r.transactions).some((t) => t.kind === "fusion"),
  );
  assert.ok(
    rows
      .flatMap((r) => r.transactions)
      .filter((t) => t.kind === "buy")
      .every((t) => !D.PARTS[t.type]?.fused),
  );
  assert.ok(
    rows.every((r) => r.rounds.every((s) => s.targetFilled <= s.targetTotal)),
  );
});
test("paid counter duels compare the same reached stage with each actually purchased CPU allowance", () => {
  assert.equal(typeof P?.compareReachedCounters, "function");
  const paths = P.comparePaidTargets(101, 3);
  const r = P.compareReachedCounters(paths.rows);
  assert.ok(r.matches.length > 0);
  assert.ok(r.matches.every((m) => m.hp === 180 + (m.round - 1) * 40));
  assert.equal(r.seatMismatches, 0);
  assert.ok(r.matches.every((m) => m.capacityA >= 12 && m.capacityB >= 12));
});
test("fusion pursuit is separated from snapshots that really field the fused purchase UI", () => {
  const paths = P.comparePaidTargets(101, 5);
  const r = P.compareReachedCounters(paths.rows);
  assert.ok(r.matches.every((m) => typeof m.targetHasOneClick === "boolean"));
  for (const m of r.matches) {
    const source = paths.rows
      .find((p) => p.seed === m.seed && p.policy === m.target)
      .rounds.find((p) => p.round === m.round);
    assert.equal(
      m.targetHasOneClick,
      source.board.some(
        (p) => p.type === "am_oneclick" && p.x !== null && p.y !== null,
      ),
    );
  }
  assert.equal(
    r.actualFusedSummary.reduce((s, g) => s + g.pairs, 0),
    r.matches.filter((m) => m.targetHasOneClick).length,
  );
});
test("onestop pursuit expands six real recipes and never buys a zero-price fused output", () => {
  const target = P.targetFor("onestop");
  assert.equal(target.id, "paid_onestop");
  assert.equal(target.layout.filter((p) => p[0] === "gov_onestop").length, 6);
  const rows = Array.from({ length: 10 }, (_, i) =>
    P.simulateTargetPath(101 + i, "onestop", {
      preferredAdmins: ["server", "backup"],
    }),
  );
  assert.ok(
    rows.some((r) =>
      r.transactions.some(
        (t) => t.kind === "fusion" && t.type === "gov_onestop",
      ),
    ),
  );
  for (const row of rows) {
    assert.equal(
      row.cash,
      10 + row.rewards - row.partSpend - row.serverSpend - row.rerollSpend,
    );
    assert.ok(row.rounds.every((r) => r.legal));
    assert.ok(
      row.transactions
        .filter((t) => t.kind === "buy")
        .every((t) => t.type !== "gov_onestop"),
    );
    assert.ok(row.rounds.every((r) => r.targetTotal === 16));
  }
});
