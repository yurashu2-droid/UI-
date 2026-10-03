import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import C from "../src/document.js";
import D from "../src/data.js";
import R from "../src/run.js";
import opponents from "../fixtures/balance/paid-counter-opponents.json" with { type: "json" };

// Any free grant, normalized enemy HP, discarded bridge, hidden baseline loss,
// skipped API action or omitted/changed pre-round-eight font purchase must break it.
test("seed308 replays a paid full-inventory rearrangement against unnormalized foes", async (t) => {
  const script = new URL(
    "../scripts/paid-rearranged-counter-witness.ts",
    import.meta.url,
  );
  assert.ok(existsSync(script), "The portable seed308 API replay is required");
  const { runPaidRearrangedCounterWitness, replayPaidRearrangedRoute } =
    await import("../scripts/paid-rearranged-counter-witness.js");
  const route = JSON.parse(
    readFileSync(
      new URL(
        "../fixtures/balance/paid-rearranged-counter-route.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const report = runPaidRearrangedCounterWitness();

  await t.test(
    "keeps the real legacy progression and every acquired ordinary item",
    () => {
      assert.equal(report.seed, 308);
      assert.equal(report.rulesVersion, "combat-v4");
      assert.equal(report.actualBaseHp, 460);
      assert.match(report.gameplayCatalogSha256, /^[0-9a-f]{64}$/);
      assert.deepEqual(JSON.parse(JSON.stringify(report)), report);
      assert.equal(report.acquisitionEventCount, 202);
      assert.equal(report.rearrangementMoves.length, 28);
      assert.equal(report.validationChecks, 224);
      for (const run of [report.acquiredRun, report.finalRun]) {
        assert.equal(R.validateRun(run), true);
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
          ["campaign", "build", 7, 7, 3, 4, 31],
        );
        assert.equal(run.pending, null);
        assert.equal(run.history.length, 7);
        assert.deepEqual(run.admin, ["backup"]);
        assert.ok(run.owned.every(C.placed));
        assert.ok(
          run.owned.every((p) => C.canPlace(run.owned, p, p.x, p.y, p.w, p.h)),
        );
        assert.ok(
          run.owned.every(
            (p) =>
              !D.PARTS[p.type].fused &&
              D.PARTS[p.type].status !== "experimental",
          ),
        );
      }
      const identity = (run) =>
        run.owned.map(({ x, y, w, h, ...part }) => part);
      assert.deepEqual(identity(report.acquiredRun), identity(report.finalRun));
      assert.deepEqual(
        { ...report.acquiredRun, owned: [] },
        { ...report.finalRun, owned: [] },
      );
      assert.deepEqual(
        report.finalRun.owned,
        [
          ["ab_link", 248, 72, 224, 24],
          ["ab_hr", 32, 330, 640, 8],
          ["ab_link", 248, 96, 224, 24],
          ["ab_nav", 248, 192, 224, 24],
          ["ab_nav", 248, 216, 224, 24],
          ["ab_heading", 248, 240, 224, 42],
          ["ab_link", 248, 120, 224, 24],
          ["ab_guestbook", 32, 354, 240, 96],
          ["go_suggest", 480, 72, 192, 250],
          ["ab_link", 248, 144, 224, 24],
          ["gov_form", 16, 16, 672, 338],
          ["ab_link", 248, 168, 224, 24],
          ["gov_pdf", 248, 282, 224, 40],
          ["gov_font", 32, 72, 208, 250],
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
      assert.equal(report.finalResources.acquisitionValue, 57);
      assert.equal(report.finalResources.load, 23);
      assert.ok(report.finalResources.legal);
    },
  );

  await t.test(
    "balances cash, earned loot and all seven actual battles including overload",
    () => {
      assert.deepEqual(report.budget, {
        parts: 51,
        plans: 12,
        rerolls: 13,
        total: 76,
        rewards: 70,
        earnedInventory: 6,
        remainingCash: 4,
      });
      assert.equal(
        report.finalRun.cash,
        10 + report.budget.rewards - report.budget.total,
      );
      assert.equal(report.transactions.length, 27);
      assert.equal(report.rewardClaims.length, 7);
      assert.deepEqual(
        report.rewardClaims.map((r) => [r.round, r.choice]),
        [
          [1, "ab_nav"],
          [2, "admin:backup"],
          [3, null],
          [4, null],
          [5, "ab_link"],
          [6, null],
          [7, null],
        ],
      );
      assert.deepEqual(report.rewardClaims[1].offered, [
        "gov_page",
        "gov_notice",
        "admin:backup",
      ]);
      assert.deepEqual(
        report.acquisitionRounds.map((r) => [
          r.round,
          r.winner,
          r.reward,
          r.load,
          r.capacity,
        ]),
        [
          [1, "player", 10, 3, 12],
          [2, "player", 10, 8, 12],
          [3, "player", 10, 12, 12],
          [4, "player", 10, 14, 17],
          [5, "player", 10, 18, 17],
          [6, "player", 10, 22, 17],
          [7, "player", 10, 22, 31],
        ],
      );
      assert.deepEqual(
        report.acquisitionRounds.map((r) => r.time),
        [10.25, 8.200000000000001, 8.85, 8.85, 13.55, 8.1, 16.1],
      );
      const font = report.transactions.find((r) => r.type === "gov_font");
      assert.deepEqual(
        [font.round, font.cost, font.cash, font.priorSettlements],
        [8, 5, 4, 7],
      );
      assert.ok(
        report.transactions.every(
          (r) => r.kind === "reroll" || r.offered.includes(r.type),
        ),
      );
      assert.equal(
        report.rearrangementMoves.filter((r) => r.args[1] === null).length,
        14,
      );
      assert.ok(report.rearrangementMoves.every((r) => r.result === true));
    },
  );

  await t.test(
    "uses identical common base HP with full foe administrators and finite capacities",
    () => {
      assert.deepEqual(
        report.opponents.map(({ resources, ...foe }) => foe),
        opponents.opponents,
      );
      assert.deepEqual(report.conditions.commonBaseHp, [396, 440, 460, 484]);
      assert.deepEqual(report.conditions.phaseSeconds, [-0.5, 0, 0.5]);
      assert.equal(report.grid.length, 24);
      assert.equal(report.baselineGrid.length, 24);
      for (const row of [...report.grid, ...report.baselineGrid]) {
        assert.deepEqual(row.forward, row.reverse);
        assert.deepEqual(row.forward.baseHp, [
          row.commonBaseHp,
          row.commonBaseHp,
        ]);
        assert.deepEqual(row.forward.initialHp, [
          row.commonBaseHp,
          Math.round(row.commonBaseHp * 1.25),
        ]);
        assert.deepEqual(row.forward.initialMaxHp, row.forward.initialHp);
        assert.deepEqual(row.forward.admins, [
          ["backup"],
          ["server", "backup"],
        ]);
        assert.deepEqual(row.forward.capacity, [
          31,
          row.foe === opponents.opponents[0].id ? 35 : 26,
        ]);
        assert.deepEqual(row.forward.load, [
          23,
          row.foe === opponents.opponents[0].id ? 28 : 19,
        ]);
        assert.deepEqual(row.forward.lag, [1, 1]);
        assert.deepEqual(row.forward.lagLoss, [0, 0]);
      }
      assert.ok(report.grid.every((r) => r.forward.winner === "own"));
      assert.equal(report.physicalWins, 48);
      assert.equal(report.baselinePhysicalWins, 28);
      assert.ok(Math.abs(report.minimumRemainingHp - 10.2) < 1e-9);
      for (const [i, expected] of [69.9, 17.2].entries()) {
        assert.ok(Math.abs(report.nominal[i].forward.ownHp - expected) < 1e-9);
        assert.deepEqual(report.nominal[i].forward.initialHp, [440, 550]);
      }
      assert.deepEqual(
        report.nominal.map((r) => r.forward.time),
        [10.15, 10.350000000000001],
      );
    },
  );

  await t.test(
    "retains original-layout losses and the already successful natural base460 controls",
    () => {
      const lossKeys = report.baselineGrid
        .filter((r) => r.forward.winner !== "own")
        .map((r) => [r.foe, r.commonBaseHp, r.phase]);
      const [cart, six] = opponents.opponents.map((r) => r.id);
      assert.deepEqual(lossKeys, [
        ...[396, 440].flatMap((hp) =>
          [-0.5, 0, 0.5].map((phase) => [cart, hp, phase]),
        ),
        [cart, 460, 0.5],
        [cart, 484, 0.5],
        [six, 396, 0.5],
        [six, 440, 0.5],
      ]);
      assert.ok(
        report.baselineGrid
          .filter((r) => r.commonBaseHp === 460 && r.phase === 0)
          .every((r) => r.forward.winner === "own"),
      );
      assert.equal(
        report.baselineGrid.find(
          (r) => r.foe === cart && r.commonBaseHp === 440 && r.phase === 0,
        ).forward.winner,
        "foe",
      );
    },
  );

  await t.test(
    "rejects altered API steps, state fingerprints, move geometry and ledgers",
    () => {
      for (const mutate of [
        (r) => {
          r.actions[0][1][0] = "gov_font";
        },
        (r) => {
          r.actions[0][2] = "0".repeat(64);
        },
        (r) => {
          r.actions[0][0] = "grant";
        },
        (r) => {
          r.actions[0][1].push("ignored");
        },
        (r) => {
          r.actions.splice(2, 1);
        },
        (r) => {
          r.budget.total = 75;
        },
        (r) => {
          r.rearrangement[0][1][0] = "missing";
        },
        (r) => {
          r.rearrangement[27][1][4] = 249;
        },
        (r) => {
          r.rearrangement[0][0] = "purchase";
        },
      ]) {
        const altered = structuredClone(route);
        mutate(altered);
        assert.throws(() => replayPaidRearrangedRoute(altered));
      }
    },
  );

  await t.test(
    "rejects a changed no-op hold even when resulting state hashes match",
    () => {
      const altered = structuredClone(route);
      const firstHold = altered.actions.find((entry) => entry[0] === "move");
      assert.deepEqual(firstHold[1], ["p1", null, null]);
      // Both pieces are already held at this point, so this changes no Run field.
      firstHold[1][0] = "p2";
      assert.throws(
        () => replayPaidRearrangedRoute(altered),
        /Recorded action sequence changed/,
      );
    },
  );

  await t.test(
    "imports silently and prints deterministic JSON through the explicit CLI from any cwd",
    () => {
      const loader = fileURLToPath(
        new URL("../node_modules/tsx/dist/loader.mjs", import.meta.url),
      );
      const invoke = (args, cwd) =>
        spawnSync(process.execPath, ["--import", loader, ...args], {
          cwd,
          encoding: "utf8",
          maxBuffer: 4 * 1024 * 1024,
        });
      const imported = invoke(
        [
          "--input-type=module",
          "-e",
          `await import(${JSON.stringify(script.href)})`,
        ],
        tmpdir(),
      );
      assert.equal(imported.status, 0, imported.stderr);
      assert.equal(imported.stdout, "");
      assert.equal(imported.stderr, "");
      const first = invoke(
        [fileURLToPath(script)],
        fileURLToPath(new URL("..", import.meta.url)),
      );
      const second = invoke([fileURLToPath(script)], tmpdir());
      assert.equal(first.status, 0, first.stderr);
      assert.equal(second.status, 0, second.stderr);
      assert.equal(first.stderr, "");
      assert.equal(second.stderr, "");
      assert.equal(first.stdout, second.stdout);
      assert.deepEqual(JSON.parse(first.stdout), report);
    },
  );
});
