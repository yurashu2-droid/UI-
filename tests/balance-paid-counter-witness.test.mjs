import test from "node:test";
import assert from "node:assert/strict";
import R from "../src/run.js";
import { runPaidCounterWitness } from "../scripts/paid-counter-witness.js";

// Removing bridge UI, granting target administrators, changing the real market,
// or silently comparing overloaded opponents must break this fixed paid witness.
test("seed122 retains its paid board and reproduces the nominal wins and admin losses", () => {
  const report = runPaidCounterWitness();
  assert.equal(report?.seed, 122);
  assert.equal(report.rulesVersion, "combat-v4");
  assert.equal(report.firstCompleteRound, 7);
  assert.equal(report.validationChecks, 40);
  assert.match(report.gameplayCatalogSha256, /^[0-9a-f]{64}$/);
  const run = report.actualRun;
  assert.equal(R.validateRun(run), true);
  const restored = JSON.parse(JSON.stringify(run));
  assert.equal(R.validateRun(restored), true);
  assert.deepEqual(restored, run);
  assert.deepEqual(
    [
      run.mode,
      run.phase,
      run.stage,
      run.wins,
      run.lives,
      run.cash,
      R.capacity(run),
    ],
    ["campaign", "build", 6, 5, 2, 11, 21],
  );
  assert.deepEqual(run.admin, []);
  assert.deepEqual(report.target.admin, ["server", "backup"]);
  assert.deepEqual(report.spend, {
    parts: 39,
    serverPlan: 6,
    rerolls: 10,
    total: 55,
  });
  assert.equal(report.preBattleRewards, 56);
  assert.equal(run.cash, 10 + report.preBattleRewards - report.spend.total);
  assert.deepEqual(report.loot, {
    items: ["gov_form", "ab_link"],
    inventoryValue: 8,
  });
  assert.deepEqual(
    [
      report.targetResources.parts,
      report.targetResources.acquisitionValue,
      report.targetResources.load,
    ],
    [10, 37, 13],
  );
  assert.deepEqual(
    [
      report.paidResources.parts,
      report.paidResources.acquisitionValue,
      report.paidResources.load,
    ],
    [12, 47, 19],
  );
  assert.deepEqual(
    run.owned,
    [
      ["ab_link", 32, 112, 96, 24],
      ["ab_hr", 32, 208, 864, 8],
      ["ab_link", 128, 112, 96, 24],
      ["gov_form", 16, 16, 920, 240],
      ["gov_font", 32, 72, 576, 32],
      ["ab_heading", 608, 80, 224, 42],
      ["ab_link", 224, 112, 96, 24],
      ["go_suggest", 32, 144, 576, 56],
      ["ab_link", 320, 112, 96, 24],
      ["ab_guestbook", 32, 256, 240, 96],
      ["ab_link", 416, 112, 96, 24],
      ["ab_link", 512, 112, 96, 24],
    ].map(([type, x, y, w, h], i) => ({
      id: `p${i + 1}`,
      type,
      x,
      y,
      w,
      h,
      shape: "source",
      label: "",
    })),
  );
  assert.deepEqual(
    report.acquisitionRounds.map((r) => [r.round, r.winner, r.time, r.reward]),
    [
      [1, "enemy", 19.1, 6],
      [2, "player", 14.3, 10],
      [3, "player", 8.200000000000001, 10],
      [4, "player", 6.25, 10],
      [5, "player", 11.950000000000001, 10],
      [6, "player", 6.25, 10],
    ],
  );
  assert.equal(report.transactions.length, 23);
  assert.ok(
    report.transactions.every((t) =>
      ["buy", "reroll", "loot"].includes(t.kind),
    ),
  );
  assert.deepEqual(
    report.opponents.map((o) => [
      o.id,
      o.resources.acquisitionValue,
      o.resources.load,
      o.capacity,
    ]),
    [
      ["s3-candidate-1100144", 74, 28, 35],
      ["s0-candidate-432", 73, 19, 26],
    ],
  );
  const result = (r) => [r.winner, r.ownHp, r.foeHp, r.time, r.initialHp];
  for (const row of [...report.grid, ...report.controls]) {
    assert.deepEqual(row.forward, row.reverse);
    assert.deepEqual(row.forward.lag, [1, 1]);
    assert.deepEqual(row.forward.lagLoss, [0, 0]);
    assert.equal(row.forward.capacity[0], 21);
    assert.deepEqual(row.forward.admins[0], []);
  }
  assert.deepEqual(
    report.nominal.map((r) => result(r.forward)),
    [
      ["own", 44.80000000000007, 0, 7.4, [420, 420]],
      ["own", 73.6, 0, 7.4, [420, 420]],
    ],
  );
  assert.deepEqual(
    report.controls.map((r) => [r.matchedActualHp, ...result(r.forward)]),
    [
      [false, "foe", 0, 39.00000000000044, 8.35, [420, 525]],
      [true, "foe", 0, 111, 8.35, [420, 420]],
      [false, "foe", 0, 80.00000000000038, 7.95, [420, 525]],
      [true, "foe", 0, 126, 7.95, [420, 420]],
    ],
  );
  assert.equal(report.grid.length, 18);
  assert.ok(report.grid.every((r) => r.forward.winner === "own"));
  for (const row of report.grid) assert.deepEqual(row.forward.admins, [[], []]);
  for (const row of report.controls)
    assert.deepEqual(row.forward.admins, [[], ["server", "backup"]]);
  assert.equal(report.minimumRemainingHp, 6.3999999999999275);
});
