/** One paid legacy-expedition witness. No search, presets or gameplay changes. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import C from "../src/document.js";
import D from "../src/data.js";
import E from "../src/engine.js";
import R from "../src/run.js";
import { board, resources, type Entrant } from "../src/buildlab.js";
import type { Item, LayoutEntry, Run } from "../src/types.js";
import { arenaCatalogDefinition } from "../src/online/catalog.js";
import fixture from "../fixtures/balance/paid-counter-opponents.json";
import { simulateCompositionPath } from "./paid-target-benchmark.js";

const target: Entrant = {
  id: "compact-one-divider",
  name: "Compact one-divider counter",
  build: true,
  // These are pursuit preferences, never an administrator grant.
  admin: ["server", "backup"],
  layout: [
    ["gov_form", 16, 16, 920, 240],
    ["gov_font", 32, 72, 576, 32],
    ...Array.from({ length: 6 }, (_, i): LayoutEntry => [
      "ab_link",
      32 + 96 * i,
      112,
      96,
      24,
    ]),
    ["go_suggest", 32, 144, 576, 56],
    ["ab_hr", 32, 208, 864, 8],
  ],
};
const layoutOf = (items: Item[]): LayoutEntry[] =>
  items.map((p) => [p.type, p.x, p.y, p.w, p.h, p.shape, p.label]);

function finish(battle: InstanceType<typeof E.Battle>) {
  for (let tick = 0; !battle.result && tick < 2400; tick++) battle.step(0.05);
  assert.ok(battle.result, "Fixed witness battle exceeded 120 seconds");
  return battle.result;
}

function acquire() {
  const path = simulateCompositionPath(122, target, {
    preferredAdmins: target.admin,
  });
  assert.equal(
    path.rulesVersion,
    "combat-v4",
    "This witness requires canonical combat-v4",
  );
  assert.equal(path.blocked, null);
  const completed = path.rounds.find((r) => r.targetLayoutComplete);
  assert.ok(completed);
  assert.equal(completed.round, 7);
  const run = R.newRun("campaign");
  assert.deepEqual(
    [
      run.cash,
      run.owned,
      run.admin,
      run.stage,
      run.wins,
      run.lives,
      R.capacity(run),
    ],
    [10, [], [], 0, 0, 3, 12],
  );
  // The sole setup substitution: select a deterministic seed and its real market.
  run.seed = 122;
  run.shop = R.market(run);
  let validationChecks = 0;
  const validate = () => {
    assert.equal(R.validateRun(run), true);
    const restored: unknown = JSON.parse(JSON.stringify(run));
    assert.equal(R.validateRun(restored), true);
    assert.deepEqual(restored, run);
    validationChecks++;
  };
  const spend = { parts: 0, serverPlan: 0, rerolls: 0, total: 0 };
  const loot = { items: [] as string[], inventoryValue: 0 };
  let preBattleRewards = 0;
  const acquisitionRounds: {
    round: number;
    winner: string;
    time: number;
    reward: number;
    cashBefore: number;
    cashAfter: number;
    load: number;
    capacity: number;
  }[] = [];
  // No round-seven settlement or loot belongs to the prebattle witness.
  const transactions = path.transactions.filter(
    (t) =>
      t.round < completed.round ||
      (t.round === completed.round && ["buy", "reroll"].includes(t.kind)),
  );
  assert.ok(
    transactions.every((t) => ["buy", "reroll", "loot"].includes(t.kind)),
  );
  validate();
  for (const snapshot of path.rounds.filter(
    (r) => r.round <= completed.round,
  )) {
    assert.equal(run.stage + 1, snapshot.round);
    const actions = transactions.filter((t) => t.round === snapshot.round);
    for (const action of actions.filter((t) =>
      ["buy", "reroll"].includes(t.kind),
    )) {
      const before = run.cash;
      if (action.kind === "buy") {
        assert.deepEqual(
          run.shop.filter((s) => !s.sold).map((s) => s.type),
          action.offered,
        );
        assert.ok(action.offered.includes(action.type));
        const plan = action.type.startsWith("plan:");
        const price = plan
          ? R.PLANS[action.type.slice(5)].price
          : D.PARTS[action.type].price;
        assert.equal(price, action.cost);
        assert.equal(R.purchase(run, action.type).ok, true);
        spend[plan ? "serverPlan" : "parts"] += price;
      } else {
        assert.equal(action.cost, R.REROLL);
        assert.equal(R.reroll(run).ok, true);
        assert.deepEqual(
          run.shop.map((s) => s.type),
          action.offered,
        );
        spend.rerolls += action.cost;
      }
      spend.total += action.cost;
      assert.equal(before - run.cash, action.cost);
      assert.equal(run.cash, action.cash);
      validate();
    }
    // Replay recorded editor placement through public moves. Never replace owned
    // inventory, money, administrators, capacity, progression, or a settlement.
    assert.deepEqual(
      run.owned.map((p) => [p.id, p.type]),
      snapshot.board.map((p) => [p.id, p.type]),
    );
    for (const part of run.owned)
      assert.equal(R.move(run, part.id, null, null), true);
    const containersFirst = [...snapshot.board].sort(
      (a, b) =>
        Number(!!D.PARTS[b.type].container) -
        Number(!!D.PARTS[a.type].container),
    );
    for (const part of containersFirst)
      assert.equal(R.move(run, part.id, part.x, part.y, part.w, part.h), true);
    assert.deepEqual(run.owned, snapshot.board);
    assert.deepEqual(run.admin, snapshot.admin);
    assert.equal(R.capacity(run), snapshot.capacity);
    assert.equal(R.playerHp(run), snapshot.baseHp);
    assert.equal(E.analyze(run.owned).load, snapshot.load);
    assert.equal(run.cash, snapshot.cash);
    assert.equal(run.cash, 10 + preBattleRewards - spend.total);
    validate();
    if (snapshot.round === completed.round) break;

    const started = R.startBattle(run);
    assert.ok(started.ok);
    const battle = started.battle;
    assert.equal(battle.combatVersion, "combat-v4");
    assert.equal(battle.experimentalRules, null);
    assert.equal(finish(battle).winner, snapshot.winner);
    assert.equal(battle.elapsed, snapshot.time);
    const settled = R.settleBattle(run, battle);
    assert.ok(settled.ok);
    preBattleRewards += settled.summary.total;
    acquisitionRounds.push({
      round: snapshot.round,
      winner: battle.result!.winner,
      time: battle.elapsed,
      reward: settled.summary.total,
      cashBefore: snapshot.cash,
      cashAfter: run.cash,
      load: snapshot.load,
      capacity: snapshot.capacity,
    });
    validate();
    const reward = actions.find((t) => t.kind === "loot");
    if (run.pending) {
      if (reward) {
        assert.deepEqual(run.pending.loot, reward.offered);
        assert.ok(reward.offered.includes(reward.type));
      }
      assert.equal(R.claimLoot(run, reward?.type ?? null).ok, true);
      if (reward) {
        assert.equal(run.cash, reward.cash);
        loot.items.push(reward.type);
        loot.inventoryValue += D.PARTS[reward.type].price;
      }
      validate();
    } else assert.equal(reward, undefined);
  }
  assert.deepEqual(spend, { parts: 39, serverPlan: 6, rerolls: 10, total: 55 });
  assert.equal(run.cash, 11);
  assert.equal(run.owned.length, 12);
  assert.ok(run.owned.every(C.placed));
  assert.ok(
    run.owned.every(
      (p) =>
        !D.PARTS[p.type].fused && D.PARTS[p.type].status !== "experimental",
    ),
  );
  assert.deepEqual(run.owned, completed.board);
  assert.deepEqual(run.admin, []);
  return {
    actualRun: run,
    spend,
    loot,
    transactions,
    acquisitionRounds,
    preBattleRewards,
    validationChecks,
  };
}

function opponents() {
  assert.equal(fixture.schemaVersion, 1);
  return fixture.opponents.map((opponent) => {
    const layout = opponent.layout as LayoutEntry[];
    const cost = resources(layout);
    assert.ok(cost.legal && cost.experimental.length === 0);
    assert.ok(cost.load <= opponent.capacity);
    return { ...opponent, layout, resources: cost };
  });
}
type Opponent = ReturnType<typeof opponents>[number];

function duel(
  run: Run,
  foe: Opponent,
  hp: number,
  phase: number,
  reverse: boolean,
  foeAdmin: string[] = [],
  matchedActualHp = false,
) {
  const retained = structuredClone(run.owned);
  const foeBoard = board(foe.layout, "opponent");
  // Server raises max HP by 25%; only the labelled matched-actual-HP control
  // compensates for it. Neither control changes the paid Run.
  const foeBaseHp = matchedActualHp ? hp / 1.25 : hp;
  const battle = new E.Battle(
    reverse ? foeBoard : retained,
    reverse ? retained : foeBoard,
    {
      combatVersion: "combat-v4",
      playerHp: reverse ? foeBaseHp : hp,
      enemyHp: reverse ? hp : foeBaseHp,
      playerCapacity: reverse ? foe.capacity : R.capacity(run),
      enemyCapacity: reverse ? R.capacity(run) : foe.capacity,
      playerAdmin: reverse ? foeAdmin : run.admin,
      enemyAdmin: reverse ? run.admin : foeAdmin,
    },
  );
  const own = reverse ? battle.enemy : battle.player;
  const other = reverse ? battle.player : battle.enemy;
  const byId = (items: Item[]) =>
    [...items].sort((a, b) => a.id.localeCompare(b.id));
  assert.deepEqual(byId(own.board), byId(retained));
  assert.equal(battle.combatVersion, "combat-v4");
  assert.equal(battle.experimentalRules, null);
  assert.deepEqual([own.lag, other.lag], [1, 1]);
  const initialHp = [own.hp, other.hp];
  // One correlated side-wide delay, not independent per-part clock sampling.
  const delayed = phase > 0 ? own : phase < 0 ? other : null;
  for (const part of delayed?.parts ?? [])
    if (part.period) part.remaining += Math.abs(phase);
  const result = finish(battle);
  assert.deepEqual(run.owned, retained);
  return {
    winner:
      result.winner === "draw"
        ? "draw"
        : result.winner === own.name
          ? "own"
          : "foe",
    ownHp: own.hp,
    foeHp: other.hp,
    time: battle.elapsed,
    initialHp,
    capacity: [own.capacity, other.capacity],
    load: [own.load, other.load],
    lag: [own.lag, other.lag],
    lagLoss: [own.lagLoss ?? 0, other.lagLoss ?? 0],
    admins: [[...own.admin], [...other.admin]],
  };
}

export function runPaidCounterWitness() {
  const acquired = acquire();
  const actualRun = acquired.actualRun;
  const before = structuredClone(actualRun);
  const foes = opponents();
  const paired = (
    foe: Opponent,
    hp: number,
    phase: number,
    admin: string[] = [],
    matchedActualHp = false,
  ) => {
    const forward = duel(
      actualRun,
      foe,
      hp,
      phase,
      false,
      admin,
      matchedActualHp,
    );
    const reverse = duel(
      actualRun,
      foe,
      hp,
      phase,
      true,
      admin,
      matchedActualHp,
    );
    assert.deepEqual(forward, reverse);
    return { foe: foe.id, hp, phase, forward, reverse };
  };
  const grid = foes.flatMap((foe) =>
    [378, 420, 462].flatMap((hp) =>
      [-0.5, 0, 0.5].map((phase) => paired(foe, hp, phase)),
    ),
  );
  const controls = foes.flatMap((foe) =>
    [false, true].map((matchedActualHp) => {
      assert.deepEqual(foe.admin, ["server", "backup"]);
      return {
        matchedActualHp,
        ...paired(foe, 420, 0, foe.admin, matchedActualHp),
      };
    }),
  );
  assert.ok(grid.every((r) => r.forward.winner === "own"));
  assert.ok(controls.every((r) => r.forward.winner === "foe"));
  assert.deepEqual(
    actualRun,
    before,
    "Duels must not edit or settle the paid Run",
  );
  return {
    seed: 122,
    rulesVersion: "combat-v4",
    firstCompleteRound: 7,
    gameplayCatalogSha256: createHash("sha256")
      .update(JSON.stringify(arenaCatalogDefinition()))
      .digest("hex"),
    note: "One paid legacy eight-round expedition witness against sampled completed boards; not paid opponents, equal spend, a cohort success rate or a closed counter cycle.",
    conditions: {
      step: 0.05,
      actualPaidCapacity: R.capacity(actualRun),
      hp: [378, 420, 462],
      phaseSeconds: [-0.5, 0, 0.5],
      phaseMeaning:
        "Negative delays all opponent periodic clocks; positive delays all paid-board periodic clocks; zero is natural startup.",
      comparisonAdmins: [[], []],
      controlAdmins: [[], ["server", "backup"]],
    },
    target: structuredClone(target),
    targetResources: resources(target.layout),
    paidResources: resources(layoutOf(actualRun.owned)),
    ...acquired,
    opponents: foes,
    nominal: grid.filter((r) => r.hp === 420 && r.phase === 0),
    grid,
    controls,
    minimumRemainingHp: Math.min(...grid.map((r) => r.forward.ownHp)),
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  console.log(JSON.stringify(runPaidCounterWitness(), null, 2));
