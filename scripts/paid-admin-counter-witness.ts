/** One paid full-admin legacy-expedition witness. No search or gameplay changes. */
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
  // Preferences in the unchanged pursuit; administrators must be earned below.
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
  const path = simulateCompositionPath(217, target, {
    preferredAdmins: target.admin,
  });
  assert.equal(path.rulesVersion, "combat-v4");
  assert.equal(path.blocked, null);
  const completed = path.rounds.find((r) => r.targetLayoutComplete);
  assert.ok(completed);
  assert.equal(completed.round, 6);
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
  // The sole setup substitution selects a seed and its real deterministic market.
  run.seed = 217;
  run.shop = R.market(run);
  let validationChecks = 0;
  const validate = () => {
    assert.equal(R.validateRun(run), true);
    const restored: unknown = JSON.parse(JSON.stringify(run));
    assert.equal(R.validateRun(restored), true);
    assert.deepEqual(restored, run);
    validationChecks++;
  };
  const spend = { parts: 0, plans: 0, rerolls: 0, total: 0 };
  let preBattleRewards = 0;
  const acquisitionRounds = [];
  const rewardClaims = [];
  const moves: (Pick<Item, "id" | "x" | "y" | "w" | "h"> & {
    round: number;
  })[] = [];
  // No round-six settlement/claim or later purchases belong to this witness.
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
        spend[plan ? "plans" : "parts"] += price;
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
      assert.equal(run.cash, 10 + preBattleRewards - spend.total);
      validate();
    }
    // Reconstruct every recorded layout through legal public editor moves.
    // Ownership, IDs, cash, capacity, admins and progression are never replaced.
    assert.deepEqual(
      run.owned.map((p) => [p.id, p.type]),
      snapshot.board.map((p) => [p.id, p.type]),
    );
    for (const part of run.owned) {
      assert.equal(R.move(run, part.id, null, null), true);
      moves.push({
        round: snapshot.round,
        id: part.id,
        x: null,
        y: null,
        w: part.w,
        h: part.h,
      });
      validate();
    }
    const containersFirst = [...snapshot.board].sort(
      (a, b) =>
        Number(!!D.PARTS[b.type].container) -
        Number(!!D.PARTS[a.type].container),
    );
    for (const part of containersFirst) {
      assert.equal(R.move(run, part.id, part.x, part.y, part.w, part.h), true);
      moves.push({
        round: snapshot.round,
        id: part.id,
        x: part.x,
        y: part.y,
        w: part.w,
        h: part.h,
      });
      validate();
    }
    assert.deepEqual(run.owned, snapshot.board);
    assert.deepEqual(run.admin, snapshot.admin);
    assert.equal(R.capacity(run), snapshot.capacity);
    assert.equal(R.playerHp(run), snapshot.baseHp);
    assert.equal(E.analyze(run.owned).load, snapshot.load);
    assert.equal(run.cash, snapshot.cash);
    assert.ok(run.owned.every(C.placed));
    assert.ok(
      run.owned.every((p) => C.canPlace(run.owned, p, p.x, p.y, p.w, p.h)),
    );
    assert.ok(snapshot.load <= R.capacity(run));
    validate();
    if (snapshot.round === completed.round) break;

    const started = R.startBattle(run);
    assert.ok(started.ok);
    const battle = started.battle;
    assert.equal(battle.combatVersion, "combat-v4");
    assert.equal(battle.experimentalRules, null);
    const initialHp = [battle.player.hp, battle.enemy.hp];
    assert.equal(finish(battle).winner, snapshot.winner);
    assert.equal(battle.elapsed, snapshot.time);
    const settled = R.settleBattle(run, battle);
    assert.ok(settled.ok);
    preBattleRewards += settled.summary.total;
    assert.equal(run.cash, 10 + preBattleRewards - spend.total);
    acquisitionRounds.push({
      round: snapshot.round,
      winner: battle.result!.winner,
      time: battle.elapsed,
      initialHp,
      reward: settled.summary.total,
      cashBefore: snapshot.cash,
      cashAfter: run.cash,
      load: snapshot.load,
      capacity: snapshot.capacity,
      summary: structuredClone(settled.summary),
    });
    validate();
    const reward = actions.find((t) => t.kind === "loot");
    if (run.pending) {
      const offered = [...run.pending.loot];
      const choice = reward?.type ?? null;
      if (reward) {
        assert.deepEqual(offered, reward.offered);
        assert.ok(offered.includes(reward.type));
        assert.equal(reward.cost, 0);
      }
      const beforeCash = run.cash;
      const beforeAdmins = [...run.admin];
      const beforeItems = structuredClone(run.owned);
      const result = R.claimLoot(run, choice);
      assert.ok(result.ok);
      assert.equal(result.item, null, "This witness earns no UI item loot");
      assert.deepEqual(run.owned, beforeItems);
      assert.deepEqual(
        run.admin,
        result.admin ? [...beforeAdmins, result.admin] : beforeAdmins,
      );
      assert.equal(run.cash, beforeCash);
      if (reward) assert.equal(run.cash, reward.cash);
      rewardClaims.push({
        round: snapshot.round,
        choice,
        offered,
        cash: run.cash,
        result,
      });
      validate();
    } else assert.equal(reward, undefined);
  }
  assert.deepEqual(spend, { parts: 42, plans: 3, rerolls: 6, total: 51 });
  assert.equal(preBattleRewards, 46);
  assert.deepEqual(
    [
      run.stage,
      run.wins,
      run.lives,
      run.cash,
      run.owned.length,
      E.analyze(run.owned).load,
      R.capacity(run),
    ],
    [5, 4, 2, 5, 11, 16, 17],
  );
  assert.equal(run.phase, "build");
  assert.equal(run.pending, null);
  assert.equal(run.history.length, 5);
  assert.ok(
    run.owned.every(
      (p) =>
        !D.PARTS[p.type].fused && D.PARTS[p.type].status !== "experimental",
    ),
  );
  assert.deepEqual(run.owned, completed.board);
  assert.deepEqual(run.admin, ["server", "backup"]);
  assert.deepEqual(
    rewardClaims
      .filter((c) => c.choice !== null)
      .map((c) => [c.round, c.choice]),
    [
      [2, "admin:server"],
      [5, "admin:backup"],
    ],
  );
  return {
    actualRun: run,
    spend,
    transactions,
    rewardClaims,
    moves,
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
    assert.deepEqual(opponent.admin, ["server", "backup"]);
    return { ...opponent, layout, resources: cost };
  });
}
type Opponent = ReturnType<typeof opponents>[number];

function duel(
  run: Run,
  foe: Opponent,
  baseHp: number,
  phase: number,
  reverse: boolean,
) {
  const retained = structuredClone(run.owned);
  const foeBoard = board(foe.layout, "opponent");
  // Match actual starting/max HP after the engine's server rounding, including
  // the explicitly counterfactual 342->428 and 418->523 sensitivity controls.
  const actualHp = Math.round(baseHp * 1.25);
  const foeBaseHp = actualHp / 1.25;
  const battle = new E.Battle(
    reverse ? foeBoard : retained,
    reverse ? retained : foeBoard,
    {
      combatVersion: "combat-v4",
      playerHp: reverse ? foeBaseHp : baseHp,
      enemyHp: reverse ? baseHp : foeBaseHp,
      playerCapacity: reverse ? foe.capacity : R.capacity(run),
      enemyCapacity: reverse ? R.capacity(run) : foe.capacity,
      playerAdmin: reverse ? foe.admin : run.admin,
      enemyAdmin: reverse ? run.admin : foe.admin,
    },
  );
  const own = reverse ? battle.enemy : battle.player;
  const other = reverse ? battle.player : battle.enemy;
  const byId = (items: Item[]) =>
    [...items].sort((a, b) => a.id.localeCompare(b.id));
  assert.deepEqual(byId(own.board), byId(retained));
  assert.deepEqual(byId(other.board), byId(foeBoard));
  assert.equal(battle.combatVersion, "combat-v4");
  assert.equal(battle.experimentalRules, null);
  assert.deepEqual([own.lag, other.lag], [1, 1]);
  const initialHp = [own.hp, other.hp];
  const initialMaxHp = [own.maxHp, other.maxHp];
  assert.deepEqual(initialHp, [actualHp, actualHp]);
  assert.deepEqual(initialMaxHp, initialHp);
  assert.deepEqual([...own.admin], ["server", "backup"]);
  assert.deepEqual([...other.admin], foe.admin);
  // Correlated side-wide delay, never independent per-part clock sampling.
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
    initialMaxHp,
    capacity: [own.capacity, other.capacity],
    load: [own.load, other.load],
    lag: [own.lag, other.lag],
    lagLoss: [own.lagLoss ?? 0, other.lagLoss ?? 0],
    admins: [[...own.admin], [...other.admin]],
  };
}

export function runPaidAdminCounterWitness() {
  const acquired = acquire();
  const actualRun = acquired.actualRun;
  const before = structuredClone(actualRun);
  const foes = opponents();
  const actualBaseHp = R.playerHp(actualRun);
  assert.equal(actualBaseHp, 380);
  const paired = (foe: Opponent, baseHp: number, phase: number) => {
    const forward = duel(actualRun, foe, baseHp, phase, false);
    const reverse = duel(actualRun, foe, baseHp, phase, true);
    assert.deepEqual(forward, reverse);
    return { foe: foe.id, baseHp, phase, forward, reverse };
  };
  const grid = foes.flatMap((foe) =>
    [-0.5, 0, 0.5].map((phase) => paired(foe, actualBaseHp, phase)),
  );
  const hpControls = foes.flatMap((foe) =>
    [342, 418].flatMap((baseHp) =>
      [-0.5, 0, 0.5].map((phase) => paired(foe, baseHp, phase)),
    ),
  );
  assert.ok(grid.every((r) => r.forward.winner === "own"));
  const losses = hpControls.filter((r) => r.forward.winner !== "own");
  assert.equal(losses.length, 1);
  assert.deepEqual(
    [
      losses[0].foe,
      losses[0].baseHp,
      losses[0].phase,
      losses[0].forward.winner,
    ],
    ["s3-candidate-1100144", 418, 0.5, "foe"],
  );
  assert.deepEqual(
    actualRun,
    before,
    "Reference duels must not edit or settle the acquired Run",
  );
  return {
    seed: 217,
    rulesVersion: "combat-v4",
    firstCompleteRound: 6,
    actualBaseHp,
    actualStartingHp: grid[0].forward.initialHp[0],
    gameplayCatalogSha256: createHash("sha256")
      .update(JSON.stringify(arenaCatalogDefinition()))
      .digest("hex"),
    note: "One paid legacy eight-round expedition snapshot against sampled completed full-admin boards. Not canonical fifteen-battle story evidence, paid opponents, equal spend, a route success rate, an optimal policy or HP-range robustness.",
    conditions: {
      step: 0.05,
      actualPaidCapacity: R.capacity(actualRun),
      actualBaseHp,
      counterfactualBaseHp: [342, 418],
      phaseSeconds: [-0.5, 0, 0.5],
      phaseMeaning:
        "Negative delays every opponent periodic clock; positive delays every paid-board periodic clock; zero is natural startup. This is a correlated side-wide shift, not independent per-part jitter.",
      hpMeaning:
        "Both sides retain server + backup. Opponent base HP is normalized to match the paid side's engine-rounded actual starting/max HP. Base 380 is acquired; 342 and 418 are counterfactual controls. No acquired Run field is changed.",
    },
    target: structuredClone(target),
    targetResources: resources(target.layout),
    paidResources: resources(layoutOf(actualRun.owned)),
    ...acquired,
    opponents: foes,
    nominal: grid.filter((r) => r.phase === 0),
    grid,
    hpControls,
    minimumRemainingHp: Math.min(...grid.map((r) => r.forward.ownHp)),
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  console.log(JSON.stringify(runPaidAdminCounterWitness(), null, 2));
