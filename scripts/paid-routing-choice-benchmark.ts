/** One paid routing-only choice. No balance, market, recipe or startup changes. */
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import C from "../src/document.js";
import D from "../src/data.js";
import E from "../src/engine.js";
import R from "../src/run.js";
import { BUILDS } from "../src/builds.js";
import { BATTLE_RULES_VERSION } from "../src/combat-rules.js";
import { board, resources, type Entrant } from "../src/buildlab.js";
import type {
  BattlePart,
  BattleSide,
  Item,
  LayoutEntry,
} from "../src/types.js";
import { simulateCompositionPath } from "./paid-target-benchmark.js";

const clone = <T>(value: T): T => structuredClone(value);
const layoutOf = (items: Item[]): LayoutEntry[] =>
  items.map((p) => [p.type, p.x, p.y, p.w, p.h]);
const target: Entrant = {
  id: "paid-routing-choice",
  name: "Two mail feeds, Cart and One-click",
  build: true,
  admin: [],
  layout: [
    ["ab_mail", 32, 142, 200, 24],
    ["am_cart", 32, 58, 200, 76],
    ["ab_mail", 240, 58, 144, 32],
    ["am_oneclick", 392, 58, 128, 40],
  ],
};
type Path = ReturnType<typeof simulateCompositionPath>;
type PaidSnapshot = Path["rounds"][number];
type Phase = "canonical" | "subject-delayed" | "opponent-delayed";
type Slice = "purchased" | "provisioned-reference";
function describe(snapshot: PaidSnapshot, items = snapshot.board) {
  assert.ok(items.every(C.placed), "All paid bridge UI stays deployed");
  const cost = resources(layoutOf(items));
  assert.ok(cost.legal);
  return {
    board: clone(items),
    cash: snapshot.cash,
    capacity: snapshot.capacity,
    admin: [...snapshot.admin],
    resources: cost,
  };
}
type Snapshot = ReturnType<typeof describe>;
function opponents() {
  const fortress = BUILDS.find((b) => b.id === "b_fort_native")!;
  const rows: { id: string; name: string; layout: LayoutEntry[] }[] = [
    { id: "native-fortress", name: fortress.name, layout: fortress.layout },
    {
      id: "twelve-links",
      name: "Twelve ordinary links",
      layout: Array.from({ length: 12 }, (_, i) => [
        "ab_link",
        32 + 96 * (i % 8),
        24 + 32 * Math.floor(i / 8),
        96,
        24,
      ]),
    },
    {
      id: "supported-four",
      name: "Four links with font and suggestion",
      layout: [
        ["gov_font", 32, 24, 640, 32],
        ...Array.from({ length: 4 }, (_, i): LayoutEntry => [
          "ab_link",
          32 + i * 96,
          56,
          96,
          24,
        ]),
        ["go_suggest", 32, 80, 640, 56],
      ],
    },
  ];
  return rows.map((row) => {
    const cost = resources(row.layout);
    assert.ok(cost.legal && cost.experimental.length === 0);
    return {
      ...row,
      board: board(row.layout, "e"),
      resources: cost,
      admin: [] as string[],
    };
  });
}
type Opponent = ReturnType<typeof opponents>[number];
function duel(
  subject: Snapshot,
  opponent: Opponent,
  hp: number,
  phase: Phase,
  slice: Slice,
  reverse: boolean,
) {
  // The reference grants common CPU32 hypothetically; it is never written to a run.
  const capacity = slice === "purchased" ? subject.capacity : 32;
  const battle = new E.Battle(
    reverse ? opponent.board : subject.board,
    reverse ? subject.board : opponent.board,
    {
      playerHp: hp,
      enemyHp: hp,
      playerCapacity: capacity,
      enemyCapacity: capacity,
      playerAdmin: reverse ? opponent.admin : subject.admin,
      enemyAdmin: reverse ? subject.admin : opponent.admin,
      combatVersion: BATTLE_RULES_VERSION,
    },
  );
  const a = reverse ? battle.enemy : battle.player,
    b = reverse ? battle.player : battle.enemy;
  const startup = (side: BattleSide, delay: number) =>
    side.parts.map((p: BattlePart) => {
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
    subject: startup(a, phase === "subject-delayed" ? 0.75 : 0),
    opponent: startup(b, phase === "opponent-delayed" ? 0.75 : 0),
  };
  const income: { time: number; id: string; value: number }[] = [];
  const conversions: {
    time: number;
    id: string;
    to: string;
    value: number;
    action: string;
  }[] = [];
  while (!battle.result)
    for (const event of battle.step(0.05)) {
      if (event.kind === "income" && event.side === a.name)
        income.push({ time: event.time, id: event.id, value: event.value });
      if (event.kind === "conversion" && event.side === a.name)
        conversions.push({
          time: event.time,
          id: event.id,
          to: event.to,
          value: event.value,
          action: event.action,
        });
    }
  const end = (side: BattleSide) => ({
    hp: side.hp,
    maxHp: side.maxHp,
    capacity: side.capacity,
    load: side.load,
    lag: side.lag,
    lagLoss: side.lagLoss ?? 0,
    admin: [...side.admin],
    damage: side.damage,
    income: side.income,
    metrics: { ...battle.metrics[side.name] },
    remainingCharge: side.parts.reduce((sum, p) => sum + p.charge, 0),
    parts: side.parts.map((p) => ({
      id: p.id,
      type: p.type,
      period: p.period,
      fires: p.fires,
      damage: p.damage,
      earned: p.earned,
      charge: p.charge,
    })),
  });
  return {
    winner:
      battle.result.winner === "draw"
        ? "draw"
        : battle.result.winner === a.name
          ? "subject"
          : "opponent",
    time: battle.elapsed,
    start,
    subject: end(a),
    opponent: end(b),
    income,
    conversions,
  };
}
function acquisition(path: Path, snapshot: PaidSnapshot) {
  // Stop at battle preparation, excluding this round's later reward/fusion.
  const transactions = path.transactions.filter(
    (t) =>
      t.round < snapshot.round ||
      (t.round === snapshot.round && ["buy", "reroll"].includes(t.kind)),
  );
  const spending = { parts: 0, rerolls: 0, server: 0, total: 0 };
  const receipts: {
    id: string;
    type: string;
    kind: string;
    round: number;
    cost: number;
    offered: string[];
  }[] = [];
  const live = new Map<string, string>();
  let nextId = 1;
  for (const transaction of transactions) {
    if (transaction.kind === "reroll") spending.rerolls += transaction.cost;
    if (transaction.kind === "buy" && transaction.type.startsWith("plan:"))
      spending.server += transaction.cost;
    if (
      ["buy", "loot"].includes(transaction.kind) &&
      !transaction.type.includes(":")
    ) {
      assert.ok(transaction.offered.includes(transaction.type));
      assert.ok(
        !D.PARTS[transaction.type].fused &&
          D.PARTS[transaction.type].status !== "experimental",
      );
      const id = "p" + nextId++;
      receipts.push({
        id,
        type: transaction.type,
        kind: transaction.kind,
        round: transaction.round,
        cost: transaction.cost,
        offered: [...transaction.offered],
      });
      live.set(id, transaction.type);
      if (transaction.kind === "buy") spending.parts += transaction.cost;
    }
    if (transaction.kind === "fusion") {
      assert.ok(transaction.inputIds && transaction.outputId);
      const donorRound = path.rounds.find(
        (r) => r.round === transaction.round,
      )!;
      assert.ok(
        R.fusionPairs(donorRound.board, {
          pair: transaction.inputIds as [string, string],
        }).some((f) => f.recipe.into === transaction.type),
      );
      for (const id of transaction.inputIds) {
        assert.ok(live.has(id));
        live.delete(id);
      }
      assert.equal(transaction.outputId, "p" + nextId++);
      live.set(transaction.outputId, transaction.type);
    }
  }
  spending.total = spending.parts + spending.rerolls + spending.server;
  assert.deepEqual(
    [...live],
    snapshot.board.map((p) => [p.id, p.type]),
  );
  return { transactions, receipts, spending };
}
function cohort(firstSeed: number, seeds: number) {
  const paths = Array.from({ length: seeds }, (_, i) =>
    simulateCompositionPath(firstSeed + i, target),
  );
  const rows = paths.map((path) => ({
    seed: path.seed,
    blocked: path.blocked,
    round8: path.rounds.some((r) => r.round === 8),
    firstComplete:
      path.rounds.find((r) => r.targetLayoutComplete)?.round ?? null,
    rounds: path.rounds.map((r) => ({
      round: r.round,
      winner: r.winner,
      outputsOwned: r.outputsOwned,
      outputsPlaced: r.outputsPlaced,
      exact: r.targetLayoutComplete,
    })),
  }));
  return {
    firstSeed,
    seeds,
    exactCompletions: rows.filter((r) => r.firstComplete !== null).length,
    round8: rows.filter((r) => r.round8).length,
    blocked: rows.filter((r) => r.blocked).length,
    rows,
  };
}
export function comparePaidRoutingChoice() {
  const path = simulateCompositionPath(110, target);
  assert.equal(path.blocked, null);
  const snapshot = path.rounds.find((r) => r.targetLayoutComplete)!;
  assert.equal(snapshot.round, 6);
  const fusion = path.transactions.find(
    (t) => t.kind === "fusion" && t.type === "am_oneclick",
  )!;
  assert.deepEqual(fusion.inputIds, ["p8", "p10"]);
  assert.equal(fusion.outputId, "p11");
  const donorRound = path.rounds.find((r) => r.round === fusion.round)!;
  const info = E.analyze(snapshot.board);
  const routing = snapshot.board
    .filter((p) => E.isIncomeProducer(p))
    .map((p) => ({
      id: p.id,
      type: p.type,
      candidates: E.incomeRouteCandidates(snapshot.board, info.near, p).map(
        (q) => q.id,
      ),
    }));
  const routed = (destination: string) => {
    const items = clone(snapshot.board);
    items.find((p) => p.id === "p7")!.routeTo = destination;
    return describe(snapshot, items);
  };
  const branches = { pool: routed("p9"), split: routed("p11") };
  const rivals = opponents();
  const matches = (["purchased", "provisioned-reference"] as Slice[]).flatMap(
    (slice) =>
      [220, 300, 380, 440].flatMap((hp) =>
        (
          ["canonical", "subject-delayed", "opponent-delayed"] as Phase[]
        ).flatMap((phase) =>
          rivals.flatMap((opponent) =>
            Object.entries(branches).map(([route, subject]) => {
              const forward = duel(subject, opponent, hp, phase, slice, false),
                reverse = duel(subject, opponent, hp, phase, slice, true);
              assert.deepEqual(
                forward,
                reverse,
                "Logical results and events match in both physical seats",
              );
              return {
                route,
                opponent: opponent.id,
                slice,
                hp,
                phase,
                forward,
                reverse,
                seatConsistent: true,
              };
            }),
          ),
        ),
      ),
  );
  for (const m of matches.filter((m) => m.route === "pool")) {
    const paired = matches.find(
      (x) =>
        x.route === "split" &&
        x.opponent === m.opponent &&
        x.slice === m.slice &&
        x.hp === m.hp &&
        x.phase === m.phase,
    )!;
    assert.deepEqual(
      m.forward.start,
      paired.forward.start,
      "Routing does not change natural clocks",
    );
    const cutoff = Math.min(m.forward.time, paired.forward.time);
    assert.deepEqual(
      m.forward.income.filter((e) => e.time <= cutoff),
      paired.forward.income.filter((e) => e.time <= cutoff),
      "Income generation is identical over the common observation window",
    );
  }
  return {
    rulesVersion: BATTLE_RULES_VERSION,
    note: "Routing-only choice in a real paid legacy-expedition inventory. Completed opponents have stated unequal input budgets and no administration. The purchased CPU21 slice overloads the fortress; CPU32 is a separate hypothetical provisioned reference. Startup delays are explicit stress, not editor options or production changes. No story difficulty, universal counter or population probability claim.",
    target: clone(target),
    path,
    witness: {
      seed: 110,
      round: snapshot.round,
      snapshot: clone(snapshot),
      fusion: clone(fusion),
      donorRound: clone(donorRound),
      routing,
      ...acquisition(path, snapshot),
    },
    branches,
    opponents: rivals,
    conditions: {
      hp: [220, 300, 380, 440],
      purchasedCapacity: snapshot.capacity,
      referenceCapacity: 32,
      subjectAdmin: [...snapshot.admin],
      opponentAdmin: [],
      startupDelay: 0.75,
    },
    cohorts: [cohort(101, 30), cohort(201, 10)],
    matches,
  };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  console.log(JSON.stringify(comparePaidRoutingChoice(), null, 2));
