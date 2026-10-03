/** A fixed, paid hold/merge decision. No combat, shop, recipe or campaign changes. */
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import C from "../src/document.js";
import D from "../src/data.js";
import E from "../src/engine.js";
import R from "../src/run.js";
import { BATTLE_RULES_VERSION } from "../src/combat-rules.js";
import { resources, type Entrant } from "../src/buildlab.js";
import type { Item, LayoutEntry, Run } from "../src/types.js";
import { runReachableCounter } from "./reachable-counter-benchmark.js";
import { simulateCompositionPath } from "./paid-target-benchmark.js";

const clone = <T>(value: T): T => structuredClone(value);
const layoutOf = (items: Item[]): LayoutEntry[] =>
  items.map((p) => [p.type, p.x, p.y, p.w, p.h]);
const target = (ordinary: boolean): Entrant => ({
  id: ordinary ? "paid-six-supported-links" : "paid-instant-links",
  name: ordinary
    ? "Six ordinary supported links"
    : "Instant Search with four links",
  build: true,
  admin: [],
  layout: [
    ["gov_font", 32, 24, 640, 32],
    ...Array.from({ length: ordinary ? 6 : 4 }, (_, i): LayoutEntry => [
      "ab_link",
      32 + i * 96,
      56,
      96,
      24,
    ]),
    [ordinary ? "go_suggest" : "go_instant", 32, 80, 640, ordinary ? 56 : 44],
  ],
});
type PaidPath = ReturnType<typeof simulateCompositionPath>;
function spending(path: PaidPath, round: number) {
  const result = { parts: 0, rerolls: 0, server: 0, total: 0 };
  for (const t of path.transactions.filter((t) => t.round <= round)) {
    if (t.kind === "reroll") result.rerolls += t.cost;
    if (t.kind === "buy") {
      assert.ok(t.offered.includes(t.type));
      if (t.type.startsWith("plan:")) result.server += t.cost;
      else {
        assert.ok(!D.PARTS[t.type].fused, "No fused output is bought");
        result.parts += t.cost;
      }
    }
  }
  result.total = result.parts + result.rerolls + result.server;
  return result;
}
function assertLegal(run: Run) {
  assert.ok(run.owned.every(C.placed), "All paid bridge items remain placed");
  assert.ok(
    run.owned.every((p) => C.canPlace(run.owned, p, p.x, p.y, p.w, p.h)),
  );
}
function describe(run: Run, bridgeIds: string[]) {
  assertLegal(run);
  return {
    board: clone(run.owned),
    cash: run.cash,
    capacity: R.capacity(run),
    admin: [...run.admin],
    resources: resources(layoutOf(run.owned)),
    bridgeIds,
    navigationAttacks: run.owned.filter(
      (p) =>
        C.placed(p) &&
        D.PARTS[p.type].kind === "attack" &&
        D.PARTS[p.type].tags.includes("navigation"),
    ).length,
  };
}
function arrangeBranch(run: Run, merged: boolean) {
  for (const p of run.owned) assert.ok(R.move(run, p.id, null, null));
  const geometry: Record<string, [number, number, number, number]> = {
    p1: [672, 16, 112, 24],
    p3: [672, 48, 224, 42],
    p5: [784, 16, 112, 24],
    p4: [32, 24, 640, 32],
    p2: [32, 56, 96, 24],
    p6: [128, 56, 96, 24],
    p7: [224, 56, 96, 24],
    p10: [320, 56, 96, 24],
    ...(merged
      ? { p11: [32, 80, 640, 44] as [number, number, number, number] }
      : {
          p8: [416, 56, 256, 36] as [number, number, number, number],
          p9: [32, 80, 384, 56] as [number, number, number, number],
        }),
  };
  for (const p of run.owned) {
    assert.ok(geometry[p.id], "No unaccounted paid item");
    assert.ok(R.move(run, p.id, ...geometry[p.id]));
  }
  assertLegal(run);
}
type Snapshot = ReturnType<typeof describe>;
function duel(
  a: Snapshot,
  b: Snapshot,
  hp: number,
  phase: string,
  reversed: boolean,
) {
  const left = reversed ? b : a,
    right = reversed ? a : b;
  const battle = new E.Battle(left.board, right.board, {
    playerHp: hp,
    enemyHp: hp,
    playerCapacity: left.capacity,
    enemyCapacity: right.capacity,
    playerAdmin: left.admin,
    enemyAdmin: right.admin,
    combatVersion: BATTLE_RULES_VERSION,
  });
  const subject = reversed ? battle.enemy : battle.player;
  const opponent = reversed ? battle.player : battle.enemy;
  const startup = (side: typeof subject, delay: number) =>
    side.parts.map((p) => {
      const canonical = p.remaining;
      if (p.period) p.remaining += delay;
      return {
        id: p.id,
        type: p.type,
        period: p.period,
        canonical,
        remaining: p.remaining,
      };
    });
  const start = {
    subject: startup(subject, phase === "subject-delayed" ? 0.75 : 0),
    opponent: startup(opponent, phase === "opponent-delayed" ? 0.75 : 0),
  };
  while (!battle.result) battle.step(0.05);
  const end = (side: typeof subject) => ({
    hp: side.hp,
    maxHp: side.maxHp,
    load: side.load,
    lag: side.lag,
    lagLoss: side.lagLoss ?? 0,
    damage: side.damage,
    fires: side.parts.map((p) => ({
      id: p.id,
      type: p.type,
      fires: p.fires,
      damage: p.damage,
      power: p.power,
      period: p.period,
    })),
  });
  return {
    winner:
      battle.result.winner === "draw"
        ? "draw"
        : battle.result.winner === subject.name
          ? "subject"
          : "opponent",
    time: battle.elapsed,
    margin: subject.hp / subject.maxHp - opponent.hp / opponent.maxHp,
    subject: end(subject),
    opponent: end(opponent),
    start,
  };
}
function measurements(snapshots: Record<string, Snapshot>) {
  const pairs = [
    ["hold", "supported"],
    ["merge", "supported"],
    ["ordinary", "supported"],
    ["merge", "hold"],
    ["merge", "ordinary"],
    ["hold", "ordinary"],
  ];
  return ["core", "whole", "purchased"].flatMap((slice) => {
    const boards = Object.fromEntries(
      Object.entries(snapshots).map(([id, original]) => {
        const snapshot = clone(original);
        if (slice !== "purchased") {
          snapshot.capacity = 17;
          snapshot.admin = [];
        }
        if (slice === "core") {
          const editor = Object.assign(R.newRun("campaign"), {
            owned: snapshot.board,
          });
          for (const itemId of snapshot.bridgeIds)
            assert.ok(R.move(editor, itemId, null, null));
          snapshot.board = editor.owned;
        }
        return [id, snapshot];
      }),
    );
    return [220, 300, 440].flatMap((hp) =>
      ["canonical", "subject-delayed", "opponent-delayed"].flatMap((phase) =>
        pairs.map(([a, b]) => {
          const forward = duel(boards[a], boards[b], hp, phase, false);
          const reverse = duel(boards[a], boards[b], hp, phase, true);
          const seatConsistent =
            forward.winner === reverse.winner &&
            forward.time === reverse.time &&
            forward.margin === reverse.margin;
          assert.ok(seatConsistent, "Reversed logical seats agree exactly");
          return { a, b, hp, slice, phase, forward, reverse, seatConsistent };
        }),
      ),
    );
  });
}
export function comparePaidInstantChoice() {
  const path = simulateCompositionPath(130, target(false));
  assert.equal(path.blocked, null);
  const transaction = path.transactions.find((t) => t.kind === "fusion")!;
  assert.equal(transaction.type, "go_instant");
  assert.equal(transaction.round, 5);
  const source = path.rounds.find((r) => r.round === transaction.round)!;
  assert.equal(source.targetFilled, source.targetTotal);
  const pair = transaction.inputIds as [string, string];
  assert.ok(
    R.fusionPairs(source.board, { pair }).some(
      (f) => f.recipe.into === "go_instant",
    ),
  );
  // Rehydrate actual recorded battle inputs, then really fight and settle the
  // donor battle. Both branches split before fusion or the same offered reward.
  const before = path.rounds.filter((r) => r.round < source.round);
  const run = Object.assign(R.newRun("campaign"), {
    seed: path.seed,
    stage: source.round - 1,
    owned: clone(source.board),
    cash: source.cash,
    capacity: source.capacity,
    admin: [...source.admin],
    nextId: Math.max(...source.board.map((p) => Number(p.id.slice(1)))) + 1,
    wins: before.filter((r) => r.winner === "player").length,
    lives: 3 - before.filter((r) => r.winner !== "player").length,
  });
  const started = R.startBattle(run);
  assert.ok(started.ok && "battle" in started);
  while (!started.battle.result) started.battle.step(0.05);
  assert.equal(started.battle.result.winner, source.winner);
  assert.equal(started.battle.elapsed, source.time);
  const settled = R.settleBattle(run, started.battle);
  assert.ok(settled.ok);
  assert.equal(run.cash, transaction.cash);
  const held = clone(run),
    merged = clone(run);
  const fusion = R.fuse(merged, { pair });
  assert.equal(fusion.length, 1);
  assert.equal(fusion[0].item.id, transaction.outputId);
  assert.equal(fusion[0].recipe.into, transaction.type);
  const reward = path.transactions.find(
    (t) => t.round === source.round && t.kind === "loot",
  )!;
  assert.ok(reward.offered.includes(reward.type));
  for (const branch of [held, merged])
    assert.ok(R.claimLoot(branch, reward.type).ok);
  arrangeBranch(held, false);
  arrangeBranch(merged, true);
  const bridgeIds = ["p1", "p3", "p5"];
  const cohorts = [false, true].flatMap((ordinary) =>
    [
      [101, 30],
      [201, 10],
    ].map(([firstSeed, count]) => {
      const paths = Array.from({ length: count }, (_, i) =>
        simulateCompositionPath(firstSeed + i, target(ordinary)),
      );
      const completions = paths.flatMap((p) => {
        const r = p.rounds.find((r) => r.targetLayoutComplete);
        return r
          ? [
              {
                seed: p.seed,
                round: r.round,
                spending: spending(p, r.round),
                resources: resources(layoutOf(r.board)),
                capacity: r.capacity,
                admin: r.admin,
                held: r.held,
              },
            ]
          : [];
      });
      return {
        target: target(ordinary),
        firstSeed,
        count,
        completions,
        exactCompletions: completions.length,
        round8: paths.filter((p) => p.rounds.some((r) => r.round === 8)).length,
        blocked: paths.filter((p) => p.blocked).length,
      };
    }),
  );
  const ordinaryPath = simulateCompositionPath(130, target(true));
  const ordinarySource = ordinaryPath.rounds.find(
    (r) => r.targetLayoutComplete,
  )!;
  const ordinaryRun = Object.assign(R.newRun("campaign"), {
    owned: clone(ordinarySource.board),
    cash: ordinarySource.cash,
    capacity: ordinarySource.capacity,
    admin: [...ordinarySource.admin],
  });
  const ordinary = {
    seed: 130,
    round: ordinarySource.round,
    spending: spending(ordinaryPath, ordinarySource.round),
    snapshot: describe(ordinaryRun, bridgeIds),
    path: ordinaryPath,
  };
  const branches = {
    hold: describe(held, bridgeIds),
    merge: describe(merged, bridgeIds),
  };
  // The fixed $23 reference is a selected ordinary layout, not a paid whole-board
  // cost match. It remains separate from the equal-$40 three-choice comparison.
  const fixed = runReachableCounter(111, 1, [], "supported-links").target;
  const fixedRun = R.newRun("lab");
  fixedRun.owned = fixed.layout.map(([t, x, y, w, h], i) =>
    C.makeItem(t, "fixed" + i, x, y, w, h),
  );
  fixedRun.capacity = 17;
  fixedRun.admin = [];
  const supported = { ...describe(fixedRun, []), capacity: 17 };
  const matches = measurements({
    ...branches,
    ordinary: ordinary.snapshot,
    supported,
  });
  return {
    note: "Fixed legacy eight-round paid paths, not canonical story difficulty or population odds. Hold and merge share the exact acquired inputs and post-battle reward; branches stop before further rerolls. Ordinary is a separately acquired same-inventory-value route. Core comparisons retain bridge ownership but hold those items; whole comparisons place everything. Canonical clocks are unmodified. Delayed phases are explicit hypothetical clock stress, never a production rule or paid route replay. No alternative battle is settled.",
    rulesVersion: BATTLE_RULES_VERSION,
    witness: {
      seed: path.seed,
      round: source.round,
      inputIds: pair,
      outputId: fusion[0].item.id,
      donors: source.board.filter((p) => pair.includes(p.id)),
      spending: spending(path, source.round),
      source,
      transaction,
      reward,
      replay: {
        winner: started.battle.result.winner,
        time: started.battle.elapsed,
      },
    },
    branches,
    supported,
    matches,
    path,
    ordinary,
    cohorts,
  };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  console.log(JSON.stringify(comparePaidInstantChoice(), null, 2));
