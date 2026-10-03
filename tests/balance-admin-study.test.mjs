import test from "node:test";
import assert from "node:assert/strict";
let S;
try {
  S = await import("../scripts/admin-balance-benchmark.js");
} catch {}
test("admin study enumerates every distinct legal two-slot choice", () => {
  assert.equal(typeof S?.adminPairs, "function");
  const pairs = S.adminPairs();
  assert.equal(pairs.length, 36);
  assert.ok(pairs.every((p) => p.length === 2 && new Set(p).size === 2));
  assert.equal(new Set(pairs.map((p) => p.join("/"))).size, 36);
});
test("two-slot comparison prices fusion inputs and distinguishes base HP from server HP", () => {
  assert.equal(typeof S?.runAdminDuel, "function");
  const r = S.runAdminDuel(
    "b_documents_heavy",
    ["server", "cdn"],
    ["adnet", "server"],
    { hp: 440, capacity: 26, fused: false },
  );
  assert.equal(r.winner, "counter");
  assert.equal(r.maxHpCounter, 550);
  assert.equal(r.maxHpCart, 550);
  assert.equal(r.costCounter, 75);
  assert.equal(r.costCart, 74);
  const f = S.runAdminDuel(
    "b_documents_heavy",
    ["server", "cdn"],
    ["adnet", "server"],
    { hp: 440, capacity: 26, fused: true },
  );
  assert.equal(f.costCart, 74);
  assert.ok(f.cartRecipes.includes("am_oneclick"));
  assert.equal(f.winner, "cart");
});
test("admin counter probes reject duplicate slots and reproduce both seats", () => {
  assert.equal(typeof S?.runAdminDuel, "function");
  assert.throws(() =>
    S.runAdminDuel(
      "b_documents_heavy",
      ["server", "server"],
      ["adnet", "server"],
      { hp: 440, capacity: 26, fused: true },
    ),
  );
  const opts = { hp: 440, capacity: 35, fused: true };
  const a = S.runAdminDuel(
      "b_fort_native",
      ["server", "backup"],
      ["adnet", "server"],
      opts,
    ),
    b = S.runAdminDuel(
      "b_fort_native",
      ["server", "backup"],
      ["adnet", "server"],
      opts,
      true,
    );
  assert.equal(a.winner, b.winner);
  assert.ok(Math.abs(a.margin - b.margin) < 1e-9);
  assert.equal(a.time, b.time);
});
