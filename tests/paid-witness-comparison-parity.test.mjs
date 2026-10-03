import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import E from "../src/engine.js";
import C from "../src/document.js";
import R from "../src/run.js";
import { board } from "../src/buildlab.js";
import { runPaidRearrangedCounterWitness } from "../scripts/paid-rearranged-counter-witness.js";
import { preparePaidWitnessComparison } from "../src/paid-witness-comparison.js";

const hash = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const identity = (run) => run.owned.map(({ x, y, w, h, ...part }) => part);
const byId = (items) => [...items].sort((a, b) => a.id.localeCompare(b.id));
const withoutId = (items) => items.map(({ id, ...part }) => part);
const schedule = (resume) => {
  const id = setImmediate(resume);
  return () => clearImmediate(id);
};

// Keep the public, synchronous production replay as an independent oracle. The
// browser model must construct real isolated Battles, not return cached answers.
test("browser paid comparisons preserve all 96 physical production cases and losing controls", async (t) => {
  const reference = runPaidRearrangedCounterWitness();
  const referenceBefore = JSON.stringify(reference);
  const model = await preparePaidWitnessComparison();
  const summaryBefore = JSON.stringify(model.summary);
  const cases = [];

  await t.test(
    "preserves all identities, real settlements, cash and historical overload",
    () => {
      const route = JSON.parse(
        readFileSync(
          new URL(
            "../fixtures/balance/paid-rearranged-counter-route.json",
            import.meta.url,
          ),
          "utf8",
        ),
      );
      const inspection = model.inspect({
        foeId: "s3-candidate-1100144",
        commonBaseHp: 440,
        phaseSeconds: 0,
      });
      assert.deepEqual(inspection.original, reference.acquiredRun);
      assert.deepEqual(inspection.rearranged, reference.finalRun);
      assert.deepEqual(model.summary.budget, reference.budget);
      assert.equal(
        model.summary.sourceFingerprint,
        hash([route.actions, route.rearrangement]),
        "source fingerprint identifies the recorded action sequence",
      );
      assert.deepEqual(
        [
          model.summary.seed,
          model.summary.itemCount,
          model.summary.stageBaseHp,
          model.summary.initialCash,
          model.summary.inventoryValue,
          model.summary.priorWins,
          model.summary.lives,
        ],
        [308, 14, 460, 10, 57, 7, 3],
      );
      const geometry = ({ x, y, w, h }) => ({ x, y, w, h });
      assert.deepEqual(
        inspection.inventory,
        reference.acquiredRun.owned.map((part, i) => ({
          id: part.id,
          type: part.type,
          before: geometry(part),
          after: geometry(reference.finalRun.owned[i]),
        })),
      );
      assert.equal(reference.seed, 308);
      assert.equal(reference.actualBaseHp, 460);
      assert.deepEqual(reference.budget, {
        parts: 51,
        plans: 12,
        rerolls: 13,
        total: 76,
        rewards: 70,
        earnedInventory: 6,
        remainingCash: 4,
      });
      assert.equal(reference.acquisitionEventCount, 202);
      assert.equal(reference.rearrangementMoves.length, 28);
      assert.equal(reference.validationChecks, 224);
      assert.equal(reference.finalResources.acquisitionValue, 57);
      assert.deepEqual(
        identity(reference.acquiredRun),
        identity(reference.finalRun),
      );
      assert.deepEqual(
        { ...reference.acquiredRun, owned: [] },
        { ...reference.finalRun, owned: [] },
      );
      for (const run of [reference.acquiredRun, reference.finalRun]) {
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
        assert.equal(run.owned.length, 14);
        assert.equal(run.history.length, 7);
        assert.equal(run.pending, null);
        assert.deepEqual(run.admin, ["backup"]);
        assert.ok(run.owned.every(C.placed));
        assert.ok(
          run.owned.every((part) =>
            C.canPlace(run.owned, part, part.x, part.y, part.w, part.h),
          ),
        );
      }
      assert.equal(hash(reference.acquiredRun), route.actions.at(-1)[2]);
      assert.equal(hash(reference.finalRun), route.rearrangement.at(-1)[2]);
      assert.equal(
        hash(reference.acquiredRun),
        "67038ae40eaa04b6c6500cd2032efb6e901cd153f0342c072173ae7e002e125f",
      );
      assert.equal(
        hash(reference.finalRun),
        "4425ad75cf0aae3ba341f339109047e23302f5051355b1cbb2e2e9b9fe15529e",
      );
      assert.deepEqual(
        reference.acquisitionRounds.map(
          ({ round, winner, reward, load, capacity }) => [
            round,
            winner,
            reward,
            load,
            capacity,
          ],
        ),
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
      const font = reference.transactions.find(
        ({ type }) => type === "gov_font",
      );
      assert.deepEqual(
        [font.round, font.cost, font.cash, font.priorSettlements],
        [8, 5, 4, 7],
      );
      assert.equal(
        10 + reference.budget.rewards - reference.budget.total,
        reference.finalRun.cash,
      );
    },
  );

  await t.test(
    "runs fresh engine duels with exact HP, CPU, equipment, physical seats and clock shifts",
    async () => {
      const Battle = E.Battle;
      const observed = [];
      E.Battle = class AuditedBattle extends Battle {
        constructor(playerBoard, enemyBoard, options) {
          super(playerBoard, enemyBoard, options);
          this.audit = {
            battle: this,
            boards: structuredClone([playerBoard, enemyBoard]),
            options: structuredClone(options),
            startup: [this.player, this.enemy].map((side) =>
              side.parts.map(({ id, period, remaining }) => ({
                id,
                period,
                remaining,
              })),
            ),
            firstStep: null,
            steps: [],
          };
          observed.push(this.audit);
        }
        step(dt) {
          if (!this.audit.firstStep)
            this.audit.firstStep = [this.player, this.enemy].map((side) =>
              side.parts.map(({ id, period, remaining }) => ({
                id,
                period,
                remaining,
              })),
            );
          this.audit.steps.push(dt);
          return super.step(dt);
        }
      };
      try {
        for (const foe of reference.opponents) {
          for (const commonBaseHp of [396, 440, 460, 484]) {
            for (const phaseSeconds of [-0.5, 0, 0.5]) {
              const selection = { foeId: foe.id, commonBaseHp, phaseSeconds };
              const selectionBefore = structuredClone(selection);
              const inspection = model.inspect(selection);
              const inspectionBefore = JSON.stringify(inspection);
              assert.deepEqual(inspection.original, reference.acquiredRun);
              assert.deepEqual(inspection.rearranged, reference.finalRun);
              assert.deepEqual(
                inspection.foe.board,
                board(foe.layout, "opponent"),
              );
              assert.deepEqual(inspection.foe.admin, foe.admin);
              assert.equal(inspection.foe.capacity, foe.capacity);
              const firstObserved = observed.length;
              const actual = await model.compare(selection, { schedule });
              const duels = observed
                .slice(firstObserved)
                .filter(({ steps }) => steps.length > 0);
              assert.equal(
                duels.length,
                4,
                "both physical seats must be independently simulated for each layout",
              );
              assert.deepEqual(actual.selection, selectionBefore);
              assert.deepEqual(selection, selectionBefore);
              assert.deepEqual(
                actual.rows.map(({ layout, paidSeat }) => [layout, paidSeat]),
                [
                  ["original", "player"],
                  ["original", "enemy"],
                  ["rearranged", "player"],
                  ["rearranged", "enemy"],
                ],
              );
              for (const [index, row] of actual.rows.entries()) {
                const grid =
                  row.layout === "original"
                    ? reference.baselineGrid
                    : reference.grid;
                const entry = grid.find(
                  (entry) =>
                    entry.foe === foe.id &&
                    entry.commonBaseHp === commonBaseHp &&
                    entry.phase === phaseSeconds,
                );
                assert.ok(entry);
                const { time, ...expected } =
                  row.paidSeat === "player" ? entry.forward : entry.reverse;
                assert.deepEqual(row, {
                  layout: row.layout,
                  paidSeat: row.paidSeat,
                  ...expected,
                  elapsed: time,
                  combatVersion: "combat-v4",
                  step: 0.05,
                });
                const audit = duels[index];
                const reverse = row.paidSeat === "enemy";
                const ownIndex = reverse ? 1 : 0;
                const foeIndex = reverse ? 0 : 1;
                const run =
                  row.layout === "original"
                    ? reference.acquiredRun
                    : reference.finalRun;
                assert.deepEqual(byId(audit.boards[ownIndex]), byId(run.owned));
                assert.deepEqual(
                  withoutId(audit.boards[foeIndex]),
                  withoutId(board(foe.layout, "oracle")),
                );
                assert.deepEqual(
                  [audit.options.playerHp, audit.options.enemyHp],
                  [commonBaseHp, commonBaseHp],
                );
                assert.deepEqual(
                  [audit.options.playerCapacity, audit.options.enemyCapacity],
                  reverse ? [foe.capacity, 31] : [31, foe.capacity],
                );
                assert.deepEqual(
                  [audit.options.playerAdmin, audit.options.enemyAdmin],
                  reverse ? [foe.admin, ["backup"]] : [["backup"], foe.admin],
                );
                assert.equal(audit.options.combatVersion, "combat-v4");
                assert.equal(audit.battle.experimentalRules, null);
                assert.ok(audit.battle.result);
                assert.ok(audit.steps.length <= 2400);
                assert.ok(audit.steps.every((step) => step === 0.05));
                const delayedIndex =
                  phaseSeconds > 0
                    ? ownIndex
                    : phaseSeconds < 0
                      ? foeIndex
                      : -1;
                assert.deepEqual(
                  audit.firstStep,
                  audit.startup.map((parts, physicalIndex) =>
                    parts.map((part) => ({
                      ...part,
                      remaining:
                        part.remaining +
                        (physicalIndex === delayedIndex && part.period
                          ? Math.abs(phaseSeconds)
                          : 0),
                    })),
                  ),
                  "phase shift follows logical ownership, once, only on periodic parts",
                );
                assert.deepEqual(row.initialHp, [
                  commonBaseHp,
                  Math.round(commonBaseHp * 1.25),
                ]);
                assert.deepEqual(row.initialMaxHp, row.initialHp);
                for (const key of Object.keys(inspection.conditions))
                  assert.deepEqual(
                    row[key],
                    inspection.conditions[key],
                    `displayed ${key} must match the actual duel`,
                  );
                assert.deepEqual(row.load, [
                  23,
                  foe.id === "s3-candidate-1100144" ? 28 : 19,
                ]);
                assert.deepEqual(row.lag, [1, 1]);
                assert.deepEqual(row.lagLoss, [0, 0]);
                cases.push({
                  selection: structuredClone(selectionBefore),
                  row: structuredClone(row),
                });
              }
              assert.equal(
                JSON.stringify(model.inspect(selection)),
                inspectionBefore,
              );
              assert.equal(JSON.stringify(model.summary), summaryBefore);
              assert.equal(JSON.stringify(reference), referenceBefore);
            }
          }
        }
      } finally {
        E.Battle = Battle;
      }
      assert.equal(cases.length, 96);
      assert.equal(
        new Set(
          observed
            .filter(({ steps }) => steps.length)
            .map(({ battle }) => battle),
        ).size,
        96,
      );
    },
  );

  await t.test(
    "retains every old loss and avoids presenting the rearrangement as uniformly better",
    () => {
      const original = cases.filter(({ row }) => row.layout === "original");
      const rearranged = cases.filter(({ row }) => row.layout === "rearranged");
      assert.equal(
        original.filter(({ row }) => row.winner === "own").length,
        28,
      );
      assert.equal(
        rearranged.filter(({ row }) => row.winner === "own").length,
        48,
      );
      assert.ok(
        Math.abs(Math.min(...rearranged.map(({ row }) => row.ownHp)) - 10.2) <
          1e-9,
      );
      const cart = "s3-candidate-1100144",
        six = "s0-candidate-432";
      const losses = [
        ...[396, 440].flatMap((hp) =>
          [-0.5, 0, 0.5].map((phase) => [cart, hp, phase]),
        ),
        [cart, 460, 0.5],
        [cart, 484, 0.5],
        [six, 396, 0.5],
        [six, 440, 0.5],
      ];
      assert.deepEqual(
        original
          .filter(({ row }) => row.winner !== "own")
          .map(({ selection, row }) => [
            selection.foeId,
            selection.commonBaseHp,
            selection.phaseSeconds,
            row.paidSeat,
          ]),
        losses.flatMap((key) =>
          ["player", "enemy"].map((seat) => [...key, seat]),
        ),
      );
      for (const paidSeat of ["player", "enemy"]) {
        const find = (layout, foeId, hp) =>
          cases.find(
            ({ selection, row }) =>
              row.layout === layout &&
              row.paidSeat === paidSeat &&
              selection.foeId === foeId &&
              selection.commonBaseHp === hp &&
              selection.phaseSeconds === 0,
          ).row;
        for (const foeId of [cart, six])
          assert.equal(find("original", foeId, 460).winner, "own");
        const before = find("original", six, 440),
          after = find("rearranged", six, 440);
        assert.equal(before.winner, "own");
        assert.equal(after.winner, "own");
        assert.ok(Math.abs(before.ownHp - 23.2) < 1e-9);
        assert.ok(Math.abs(after.ownHp - 17.2) < 1e-9);
        assert.ok(
          after.ownHp < before.ownHp,
          "faster does not imply a larger HP margin",
        );
        assert.ok(after.elapsed < before.elapsed);
        assert.equal(find("original", cart, 440).winner, "foe");
        assert.equal(find("rearranged", cart, 440).winner, "own");
      }
    },
  );

  await t.test(
    "repeating a selected comparison does not carry damage, clock shifts or result mutations forward",
    async () => {
      const selection = {
        foeId: "s0-candidate-432",
        commonBaseHp: 440,
        phaseSeconds: 0.5,
      };
      const expected = cases
        .filter(
          (entry) =>
            JSON.stringify(entry.selection) === JSON.stringify(selection),
        )
        .map(({ row }) => row);
      const first = await model.compare(selection, { schedule });
      assert.deepEqual(first.rows, expected);
      try {
        first.rows[0].ownHp = -999;
      } catch (error) {
        assert.ok(error instanceof TypeError);
      }
      try {
        first.rows[0].admins[0].push("server");
      } catch (error) {
        assert.ok(error instanceof TypeError);
      }
      try {
        first.selection.phaseSeconds = -0.5;
      } catch (error) {
        assert.ok(error instanceof TypeError);
      }
      assert.deepEqual(
        (await model.compare(selection, { schedule })).rows,
        expected,
      );
      assert.equal(JSON.stringify(model.summary), summaryBefore);
      assert.equal(JSON.stringify(reference), referenceBefore);
    },
  );
});
