import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import C from "../src/document.js";
import D from "../src/data.js";
import R from "../src/run.js";
import fixture from "../fixtures/balance/paid-counter-opponents.json" with { type: "json" };

// Changing stock/prices, granting admins, discarding the paid heading, dropping
// enemy admins, or hiding the higher-HP loss must break this real-engine witness.
test("seed217 reproduces its paid full-admin counter and its higher-HP limit", async (t) => {
  assert.ok(
    existsSync(
      new URL("../scripts/paid-admin-counter-witness.ts", import.meta.url),
    ),
    "The portable seed217 public replay is required",
  );
  const { runPaidAdminCounterWitness } =
    await import("../scripts/paid-admin-counter-witness.js");
  const report = runPaidAdminCounterWitness();

  await t.test("keeps the complete legally acquired pre-round6 Run", () => {
    assert.equal(report.seed, 217);
    assert.equal(report.rulesVersion, "combat-v4");
    assert.equal(report.firstCompleteRound, 6);
    assert.equal(report.actualBaseHp, 380);
    assert.equal(report.actualStartingHp, 475);
    assert.match(report.gameplayCatalogSha256, /^[0-9a-f]{64}$/);
    assert.ok(report.validationChecks >= 34);
    const run = report.actualRun;
    assert.equal(R.validateRun(run), true);
    assert.deepEqual(JSON.parse(JSON.stringify(report)), report);
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
      ["campaign", "build", 5, 4, 2, 5, 17],
    );
    assert.deepEqual(run.admin, ["server", "backup"]);
    assert.equal(run.pending, null);
    assert.equal(run.history.length, 5);
    assert.ok(run.owned.every(C.placed));
    assert.ok(
      run.owned.every(
        (p) =>
          !D.PARTS[p.type].fused && D.PARTS[p.type].status !== "experimental",
      ),
    );
    assert.deepEqual(
      run.owned,
      [
        ["ab_link", 32, 112, 96, 24],
        ["ab_hr", 32, 208, 864, 8],
        ["ab_link", 128, 112, 96, 24],
        ["gov_font", 32, 72, 576, 32],
        ["ab_link", 224, 112, 96, 24],
        ["go_suggest", 32, 144, 576, 56],
        ["ab_link", 320, 112, 96, 24],
        ["ab_heading", 608, 80, 224, 42],
        ["gov_form", 16, 16, 920, 240],
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
      [11, 42, 16],
    );
    assert.ok(report.paidResources.legal);
    assert.deepEqual(report.paidResources.experimental, []);
  });

  await t.test(
    "balances every paid transaction and actual reward claim",
    () => {
      assert.deepEqual(report.spend, {
        parts: 42,
        plans: 3,
        rerolls: 6,
        total: 51,
      });
      assert.equal(report.preBattleRewards, 46);
      assert.equal(
        report.actualRun.cash,
        10 + report.preBattleRewards - report.spend.total,
      );
      assert.deepEqual(
        report.transactions.map((a) => [
          a.round,
          a.kind,
          a.type,
          a.cost,
          a.cash,
        ]),
        [
          [1, "buy", "ab_link", 3, 7],
          [1, "buy", "ab_hr", 3, 4],
          [2, "buy", "ab_link", 3, 7],
          [2, "buy", "gov_font", 5, 2],
          [2, "loot", "admin:server", 0, 12],
          [3, "buy", "ab_link", 3, 9],
          [3, "buy", "go_suggest", 6, 3],
          [4, "reroll", "reroll", 1, 12],
          [4, "buy", "ab_link", 3, 9],
          [4, "reroll", "reroll", 1, 8],
          [4, "buy", "ab_heading", 5, 3],
          [5, "reroll", "reroll", 1, 12],
          [5, "reroll", "reroll", 1, 11],
          [5, "buy", "gov_form", 5, 6],
          [5, "buy", "plan:srv_s", 3, 3],
          [5, "loot", "admin:backup", 0, 13],
          [6, "buy", "ab_link", 3, 10],
          [6, "reroll", "reroll", 1, 9],
          [6, "reroll", "reroll", 1, 8],
          [6, "buy", "ab_link", 3, 5],
        ],
      );
      assert.ok(
        report.transactions.every(
          (a) => a.kind === "reroll" || a.offered.includes(a.type),
        ),
      );
      assert.deepEqual(
        report.rewardClaims.map((c) => [c.round, c.choice, c.result]),
        [
          [2, "admin:server", { ok: true, item: null, admin: "server" }],
          [3, null, { ok: true, item: null, admin: null }],
          [4, null, { ok: true, item: null, admin: null }],
          [5, "admin:backup", { ok: true, item: null, admin: "backup" }],
        ],
      );
      assert.deepEqual(
        report.rewardClaims
          .filter((c) => c.choice !== null)
          .map((c) => c.offered),
        [
          ["gov_page", "gov_form", "admin:server"],
          ["ab_nav", "ab_counter", "admin:backup"],
        ],
      );
      assert.deepEqual(
        report.acquisitionRounds.map((r) => [
          r.round,
          r.winner,
          r.time,
          r.reward,
          r.load,
          r.capacity,
          r.initialHp[0],
        ]),
        [
          [1, "enemy", 19.1, 6, 2, 12, 180],
          [2, "player", 10.25, 10, 4, 12, 220],
          [3, "player", 7.5, 10, 7, 12, 325],
          [4, "player", 6.15, 10, 11, 12, 375],
          [5, "player", 9.65, 10, 14, 17, 425],
        ],
      );
      assert.ok(report.moves.length > report.actualRun.owned.length);
      assert.equal(Math.max(...report.moves.map((m) => m.round)), 6);
    },
  );

  await t.test(
    "retains fixture admins and wins both seats at actual 475 HP",
    () => {
      assert.deepEqual(
        report.opponents.map(({ resources, ...opponent }) => opponent),
        fixture.opponents,
      );
      assert.deepEqual(
        report.opponents.map((o) => [
          o.resources.acquisitionValue,
          o.resources.load,
          o.capacity,
        ]),
        [
          [74, 28, 35],
          [73, 19, 26],
        ],
      );
      assert.equal(report.grid.length, 6);
      assert.deepEqual(
        report.grid.map((r) => [r.foe, r.baseHp, r.phase]),
        fixture.opponents.flatMap((o) =>
          [-0.5, 0, 0.5].map((phase) => [o.id, 380, phase]),
        ),
      );
      for (const row of [...report.grid, ...report.hpControls]) {
        assert.deepEqual(row.forward, row.reverse);
        assert.deepEqual(row.forward.admins, [
          ["server", "backup"],
          ["server", "backup"],
        ]);
        assert.deepEqual(row.forward.initialHp, row.forward.initialMaxHp);
        assert.equal(row.forward.initialHp[0], row.forward.initialHp[1]);
        assert.deepEqual(row.forward.lag, [1, 1]);
        assert.deepEqual(row.forward.lagLoss, [0, 0]);
        assert.equal(row.forward.capacity[0], 17);
        assert.equal(row.forward.load[0], 16);
        assert.ok(
          row.forward.load.every((load, i) => load <= row.forward.capacity[i]),
        );
      }
      assert.ok(
        report.grid.every(
          (r) => r.forward.winner === "own" && r.forward.initialHp[0] === 475,
        ),
      );
      assert.deepEqual(
        report.nominal.map((r) => [
          r.forward.winner,
          r.forward.ownHp,
          r.forward.foeHp,
          r.forward.time,
        ]),
        [
          ["own", 33, 0, 10.8],
          ["own", 21.199999999999996, 0, 11.950000000000001],
        ],
      );
      assert.equal(report.minimumRemainingHp, 21.199999999999996);
    },
  );

  await t.test(
    "preserves the rounded 523-HP Cart loss instead of claiming HP robustness",
    () => {
      assert.equal(report.hpControls.length, 12);
      assert.deepEqual(
        [...new Set(report.hpControls.map((r) => r.baseHp))],
        [342, 418],
      );
      for (const row of report.hpControls)
        assert.equal(row.forward.initialHp[0], row.baseHp === 342 ? 428 : 523);
      const losses = report.hpControls.filter(
        (r) => r.forward.winner !== "own",
      );
      assert.equal(losses.length, 1);
      const loss = losses[0];
      assert.deepEqual(
        [
          loss.foe,
          loss.baseHp,
          loss.phase,
          loss.forward.winner,
          loss.forward.ownHp,
          loss.forward.foeHp,
          loss.forward.time,
        ],
        ["s3-candidate-1100144", 418, 0.5, "foe", 0, 15.999999999999986, 12.15],
      );
    },
  );
});
