/** One fixed paid route and retained-inventory geometry; no search or save writes. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import C from "../src/document.js";
import D from "../src/data.js";
import E from "../src/engine.js";
import R from "../src/run.js";
import { board, resources } from "../src/buildlab.js";
import { arenaCatalogDefinition } from "../src/online/catalog.js";
import type { Item, LayoutEntry, Run } from "../src/types.js";
import fixture from "../fixtures/balance/paid-rearranged-counter-route.json";
import opponentFixture from "../fixtures/balance/paid-counter-opponents.json";

type Action = [string, unknown[], string];
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const layoutOf = (items: Item[]): LayoutEntry[] =>
  items.map((p) => [p.type, p.x, p.y, p.w, p.h, p.shape, p.label]);
const identity = (run: Run) => run.owned.map(({ x, y, w, h, ...part }) => part);
const nonGeometry = (run: Run) => ({ ...run, owned: identity(run) });
const canonicalBudget = {
  parts: 51,
  plans: 12,
  rerolls: 13,
  total: 76,
  rewards: 70,
  earnedInventory: 6,
  remainingCash: 4,
};

function record(value: unknown): asserts value is Record<string, unknown> {
  assert.ok(
    value && typeof value === "object" && !Array.isArray(value),
    "Expected a record",
  );
}
function actions(value: unknown, length: number): asserts value is Action[] {
  assert.ok(
    Array.isArray(value) && value.length === length,
    "Unexpected action count",
  );
  for (const entry of value) {
    assert.ok(
      Array.isArray(entry) && entry.length === 3,
      "Expected [API, arguments, resulting Run SHA-256]",
    );
    const [kind, args, after] = entry;
    assert.ok(
      [
        "purchase",
        "reroll",
        "move",
        "startBattle",
        "settleBattle",
        "claimLoot",
      ].includes(kind),
      "Unsupported API action",
    );
    assert.ok(Array.isArray(args));
    assert.match(after, /^[0-9a-f]{64}$/);
    if (kind === "move") moveArgs(args);
    else if (kind === "purchase" || kind === "claimLoot") {
      assert.equal(args.length, 1);
      assert.ok(
        typeof args[0] === "string" ||
          (kind === "claimLoot" && args[0] === null),
      );
    } else assert.equal(args.length, 0);
  }
}
function moveArgs(
  args: unknown[],
): asserts args is [string, number | null, number | null, number?, number?] {
  assert.ok(
    args.length === 3 || args.length === 5,
    "Unexpected move arguments",
  );
  assert.equal(typeof args[0], "string");
  assert.ok(
    (args[1] === null && args[2] === null) ||
      (Number.isFinite(args[1]) && Number.isFinite(args[2])),
  );
  if (args.length === 5)
    assert.ok(Number.isFinite(args[3]) && Number.isFinite(args[4]));
}
function finish(battle: InstanceType<typeof E.Battle>) {
  assert.equal(battle.combatVersion, "combat-v4");
  assert.equal(battle.experimentalRules, null);
  for (let tick = 0; !battle.result && tick < 2400; tick++) battle.step(0.05);
  assert.ok(battle.result, "Fixed witness battle exceeded 120 seconds");
  return battle.result;
}
function placed(run: Run) {
  assert.ok(run.owned.every(C.placed), "No battle may start with held pieces");
  assert.ok(
    run.owned.every((p) => C.canPlace(run.owned, p, p.x, p.y, p.w, p.h)),
  );
}

/** Fixed project data is accepted explicitly only to exercise rejection tests. */
export function replayPaidRearrangedRoute(input: unknown = fixture) {
  record(input);
  assert.deepEqual(
    Object.keys(input).sort(),
    [
      "schemaVersion",
      "seed",
      "initialStateSha256",
      "budget",
      "actions",
      "rearrangement",
    ].sort(),
  );
  assert.equal(input.schemaVersion, 1);
  assert.equal(input.seed, 308);
  assert.equal(typeof input.initialStateSha256, "string");
  assert.deepEqual(
    input.budget,
    canonicalBudget,
    "Historical cash ledger changed",
  );
  actions(input.actions, 202);
  actions(input.rearrangement, 28);
  assert.ok(
    input.rearrangement.every(([kind]) => kind === "move"),
    "Rearrangement may only move owned items",
  );
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
  // The only initial substitution selects the seed and its production market.
  run.seed = 308;
  run.shop = R.market(run);
  assert.equal(hash(run), input.initialStateSha256, "Initial Run differs");
  let validationChecks = 0;
  const validate = () => {
    assert.equal(R.validateRun(run), true);
    const restored: unknown = JSON.parse(JSON.stringify(run));
    assert.equal(R.validateRun(restored), true);
    assert.deepEqual(restored, run);
    validationChecks++;
  };
  validate();
  const budget = {
    parts: 0,
    plans: 0,
    rerolls: 0,
    total: 0,
    rewards: 0,
    earnedInventory: 0,
    remainingCash: 10,
  };
  const acquiredIdentity: ReturnType<typeof identity> = [];
  const transactions = [];
  const rewardClaims = [];
  const acquisitionRounds = [];
  const acquisitionMoves = [];
  let active: {
    battle: InstanceType<typeof E.Battle>;
    round: number;
    cashBefore: number;
    load: number;
    capacity: number;
    initialHp: number[];
  } | null = null;
  const move = (entry: Action, n: number) => {
    const [, args, after] = entry;
    moveArgs(args);
    const before = hash(run),
      conserved = structuredClone(nonGeometry(run));
    assert.equal(R.move(run, ...args), true, `Illegal move ${n}`);
    assert.deepEqual(
      nonGeometry(run),
      conserved,
      "Move changed inventory identity or economic/progression state",
    );
    assert.equal(hash(run), after, `Run after move ${n}`);
    return { n, args: [...args], before, after, result: true };
  };
  for (const [n, entry] of input.actions.entries()) {
    const [kind, args, after] = entry;
    const round = run.stage + 1,
      cashBefore = run.cash;
    assert.ok(
      !active || kind === "settleBattle",
      "An acquisition battle must be settled before another action",
    );
    switch (kind) {
      case "move":
        acquisitionMoves.push(move(entry, n));
        break;
      case "purchase": {
        const type = args[0] as string;
        const offered = run.shop.filter((s) => !s.sold).map((s) => s.type);
        assert.ok(offered.includes(type), "Purchase was not offered");
        const plan = type.startsWith("plan:");
        const cost = plan ? R.PLANS[type.slice(5)].price : D.PARTS[type].price;
        const result = R.purchase(run, type);
        assert.ok(result.ok, `Purchase failed at action ${n}`);
        assert.equal(cashBefore - run.cash, cost);
        budget[plan ? "plans" : "parts"] += cost;
        budget.total += cost;
        if ("item" in result) acquiredIdentity.push(identity(run).at(-1)!);
        transactions.push({
          n,
          round,
          kind,
          type,
          cost,
          cash: run.cash,
          offered,
          priorSettlements: acquisitionRounds.length,
        });
        break;
      }
      case "reroll": {
        assert.ok(R.reroll(run).ok, `Reroll failed at action ${n}`);
        assert.equal(cashBefore - run.cash, R.REROLL);
        budget.rerolls += R.REROLL;
        budget.total += R.REROLL;
        transactions.push({
          n,
          round,
          kind,
          type: "reroll",
          cost: R.REROLL,
          cash: run.cash,
          offered: run.shop.map((s) => s.type),
          priorSettlements: acquisitionRounds.length,
        });
        break;
      }
      case "startBattle": {
        assert.equal(active, null);
        placed(run);
        const result = R.startBattle(run);
        assert.ok(result.ok, `Battle failed to start at action ${n}`);
        assert.equal(result.battle.combatVersion, "combat-v4");
        assert.equal(result.battle.experimentalRules, null);
        active = {
          battle: result.battle,
          round,
          cashBefore,
          load: result.battle.player.load,
          capacity: result.battle.player.capacity,
          initialHp: [result.battle.player.hp, result.battle.enemy.hp],
        };
        break;
      }
      case "settleBattle": {
        assert.ok(active, "No actual battle to settle");
        const { battle, ...start } = active;
        finish(battle);
        const result = R.settleBattle(run, battle);
        assert.ok(result.ok);
        budget.rewards += result.summary.total;
        acquisitionRounds.push({
          ...start,
          winner: battle.result!.winner,
          time: battle.elapsed,
          reward: result.summary.total,
          cashAfter: run.cash,
          summary: structuredClone(result.summary),
        });
        active = null;
        break;
      }
      case "claimLoot": {
        assert.ok(run.pending, "No earned loot offer");
        const offered = [...run.pending.loot],
          choice = args[0] as string | null;
        assert.ok(choice === null || offered.includes(choice));
        const result = R.claimLoot(run, choice);
        assert.ok(result.ok, `Loot claim failed at action ${n}`);
        assert.equal(run.cash, cashBefore);
        if (result.item) {
          acquiredIdentity.push(identity(run).at(-1)!);
          budget.earnedInventory += D.PARTS[result.item.type].price;
        }
        rewardClaims.push({
          n,
          round,
          choice,
          offered,
          cash: run.cash,
          result: structuredClone(result),
        });
        break;
      }
      default:
        assert.fail(`Unsupported action ${kind}`);
    }
    assert.deepEqual(
      identity(run),
      acquiredIdentity,
      `Acquired identity at action ${n}`,
    );
    assert.equal(
      run.cash,
      10 + budget.rewards - budget.total,
      `Cash conservation at action ${n}`,
    );
    assert.equal(hash(run), after, `Run after action ${n}`);
    if (run.phase !== "battle") validate();
  }
  assert.equal(active, null);
  budget.remainingCash = run.cash;
  assert.deepEqual(budget, canonicalBudget);
  assert.deepEqual(
    [
      run.phase,
      run.stage,
      run.wins,
      run.lives,
      run.owned.length,
      R.capacity(run),
      R.playerHp(run),
    ],
    ["build", 7, 7, 3, 14, 31, 460],
  );
  assert.deepEqual(run.admin, ["backup"]);
  assert.equal(run.history.length, 7);
  assert.equal(run.pending, null);
  assert.ok(
    run.owned.every(
      (p) =>
        !D.PARTS[p.type].fused && D.PARTS[p.type].status !== "experimental",
    ),
  );
  placed(run);
  const acquiredRun = structuredClone(run);
  const rearrangementMoves = input.rearrangement.map((entry, n) => {
    const result = move(entry, n);
    validate();
    return result;
  });
  placed(run);
  assert.deepEqual(nonGeometry(run), nonGeometry(acquiredRun));
  assert.equal(E.analyze(run.owned).load, 23);
  assert.ok(E.analyze(run.owned).load <= R.capacity(run));
  // State digests alone cannot detect swapping two already-held no-op moves.
  // Pin the recorded sequence too, after independently executing every API.
  assert.equal(
    hash([input.actions, input.rearrangement]),
    "9ea3f00f9edb095147d7807bf27575dda0d1fe472e4540428cf78870f95a35cb",
    "Recorded action sequence changed",
  );
  return {
    acquiredRun,
    finalRun: run,
    budget,
    acquisitionEventCount: input.actions.length,
    acquisitionMoves,
    rearrangementMoves,
    transactions,
    rewardClaims,
    acquisitionRounds,
    validationChecks,
  };
}

function opponents() {
  assert.equal(opponentFixture.schemaVersion, 1);
  return opponentFixture.opponents.map((foe) => {
    const layout = foe.layout as LayoutEntry[];
    const cost = resources(layout);
    assert.ok(
      cost.legal && cost.experimental.length === 0 && cost.load <= foe.capacity,
    );
    assert.deepEqual(foe.admin, ["server", "backup"]);
    return { ...foe, layout, resources: cost };
  });
}
function duel(
  run: Run,
  foe: ReturnType<typeof opponents>[number],
  commonBaseHp: number,
  phase: number,
  reverse: boolean,
) {
  const retained = structuredClone(run.owned),
    foeBoard = board(foe.layout, "opponent");
  const battle = new E.Battle(
    reverse ? foeBoard : retained,
    reverse ? retained : foeBoard,
    {
      combatVersion: "combat-v4",
      // Intentionally identical base HP: never divide the foe's HP by 1.25.
      playerHp: commonBaseHp,
      enemyHp: commonBaseHp,
      playerCapacity: reverse ? foe.capacity : R.capacity(run),
      enemyCapacity: reverse ? R.capacity(run) : foe.capacity,
      playerAdmin: reverse ? foe.admin : run.admin,
      enemyAdmin: reverse ? run.admin : foe.admin,
    },
  );
  const own = reverse ? battle.enemy : battle.player,
    other = reverse ? battle.player : battle.enemy;
  const byId = (items: Item[]) =>
    [...items].sort((a, b) => a.id.localeCompare(b.id));
  assert.deepEqual(byId(own.board), byId(retained));
  assert.deepEqual(byId(other.board), byId(foeBoard));
  const initialHp = [own.hp, other.hp],
    initialMaxHp = [own.maxHp, other.maxHp];
  assert.deepEqual(initialHp, [commonBaseHp, Math.round(commonBaseHp * 1.25)]);
  assert.deepEqual(initialMaxHp, initialHp);
  assert.deepEqual([...own.admin], ["backup"]);
  assert.deepEqual([...other.admin], ["server", "backup"]);
  assert.deepEqual([own.lag, other.lag], [1, 1]);
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
    baseHp: [commonBaseHp, commonBaseHp],
    initialHp,
    initialMaxHp,
    capacity: [own.capacity, other.capacity],
    load: [own.load, other.load],
    lag: [own.lag, other.lag],
    lagLoss: [own.lagLoss ?? 0, other.lagLoss ?? 0],
    admins: [[...own.admin], [...other.admin]],
  };
}

export function runPaidRearrangedCounterWitness() {
  const acquired = replayPaidRearrangedRoute(),
    foes = opponents();
  const before = structuredClone(acquired);
  const commonBaseHp = [396, 440, 460, 484],
    phaseSeconds = [-0.5, 0, 0.5];
  const gridFor = (run: Run) =>
    foes.flatMap((foe) =>
      commonBaseHp.flatMap((base) =>
        phaseSeconds.map((phase) => {
          const forward = duel(run, foe, base, phase, false),
            reverse = duel(run, foe, base, phase, true);
          assert.deepEqual(forward, reverse);
          return { foe: foe.id, commonBaseHp: base, phase, forward, reverse };
        }),
      ),
    );
  const baselineGrid = gridFor(acquired.acquiredRun),
    grid = gridFor(acquired.finalRun);
  assert.ok(grid.every((row) => row.forward.winner === "own"));
  assert.equal(
    baselineGrid.filter((row) => row.forward.winner === "own").length,
    14,
  );
  assert.deepEqual(
    acquired,
    before,
    "Reference duels must not edit or settle either saved Run",
  );
  return {
    seed: 308,
    rulesVersion: "combat-v4",
    actualBaseHp: R.playerHp(acquired.finalRun),
    gameplayCatalogSha256: hash(arenaCatalogDefinition()),
    note: "One legacy eight-round paid route plus a fixed legal rearrangement/resizing. Importing the Run and clicking Battle does not reproduce these fixture duels. No canonical-story, reliable-shopping, equal-spend, all-HP or visual-acceptance claim.",
    conditions: {
      step: 0.05,
      commonBaseHp,
      phaseSeconds,
      hpMeaning:
        "Both sides receive the same unnormalized base HP. Own backup leaves HP unchanged; foe server multiplies HP by 1.25. Base460 matches acquired stage HP; 396/440/484 are counterfactual battle options, never Run edits.",
      phaseMeaning:
        "Negative delays every foe periodic clock; positive delays every own periodic clock; zero retains natural startup. Correlated side-wide shift, not independent per-part jitter.",
      launchMeaning:
        "Use this explicit CLI fixture-duel path. The genuine campaign Run instead continues to round8 YouTube at actual460/560. Neither exact opponent fixture is selectable in the normal lab, whose launch also uses unbounded capacity and selected-enemy HP.",
    },
    ...acquired,
    opponents: foes,
    originalResources: resources(layoutOf(acquired.acquiredRun.owned)),
    finalResources: resources(layoutOf(acquired.finalRun.owned)),
    baselineGrid,
    grid,
    nominal: grid.filter((r) => r.commonBaseHp === 440 && r.phase === 0),
    physicalWins: grid.filter((r) => r.forward.winner === "own").length * 2,
    baselinePhysicalWins:
      baselineGrid.filter((r) => r.forward.winner === "own").length * 2,
    minimumRemainingHp: Math.min(...grid.map((r) => r.forward.ownHp)),
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  console.log(JSON.stringify(runPaidRearrangedCounterWitness(), null, 2));
