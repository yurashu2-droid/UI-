/** Fixed paid-navigation witnesses; editor-only alternatives for their actual next battles. */
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import C from "../src/document.js";
import R from "../src/run.js";
import { BUILDS } from "../src/builds.js";
import { BATTLE_RULES_VERSION } from "../src/combat-rules.js";
import type { Run } from "../src/types.js";
import { compositionProgress } from "./paid-composition.js";
import { simulateCompositionPath } from "./paid-target-benchmark.js";

const SEEDS = [103, 113, 115, 126, 208];
const POLICIES = [
  { id: "hold-heading", types: ["ab_heading"] },
  { id: "hold-guestbook", types: ["ab_guestbook"] },
  { id: "hold-all-bridge", types: ["ab_heading", "ab_guestbook"] },
];

function fight(run: Run, policy: string, heldIds: string[]) {
  const snapshot = {
    policy,
    heldIds,
    board: structuredClone(run.owned),
    cash: run.cash,
    capacity: R.capacity(run),
    admin: [...run.admin],
    opponent: {
      id: R.opponent(run).id,
      hp: R.opponent(run).hp,
      admin: R.opponent(run).admin,
      board: R.enemyBoard(run),
    },
  };
  const started = R.startBattle(run);
  assert.ok(started.ok && "battle" in started, "Recorded paid battle starts");
  const b = started.battle;
  while (!b.result) b.step(0.05);
  return {
    ...snapshot,
    winner: b.result.winner,
    time: b.elapsed,
    playerHp: b.player.hp,
    maxHp: b.player.maxHp,
    enemyHp: b.enemy.hp,
    margin: b.player.hp / b.player.maxHp - b.enemy.hp / b.enemy.maxHp,
    load: b.player.load,
    lag: b.player.lag,
    lagLoss: b.player.lagLoss ?? 0,
  };
}

export function comparePaidBridgeCleanup() {
  const target = {
    ...BUILDS.find((b) => b.id === "b_navigation_replay")!,
    build: true,
  };
  const paths = SEEDS.map((seed) => simulateCompositionPath(seed, target));
  const rows = paths.flatMap((path) => {
    assert.equal(path.blocked, null);
    const completed = path.rounds.filter((r) => r.targetLayoutComplete);
    assert.ok(completed.length > 0, "Known witness still reaches the target");
    return completed.map((source, i) => {
      // Rehydrate only the recorded paid battle inputs. Do not settle any
      // alternative, regenerate its shop, or pretend its later route was played.
      const original = Object.assign(R.newRun("campaign"), {
        seed: path.seed,
        stage: source.round - 1,
        owned: structuredClone(source.board),
        admin: [...source.admin],
        capacity: source.capacity,
        cash: source.cash,
      });
      const targetIds = new Set<string>();
      for (const [type, x, y, w, h] of target.layout) {
        const p = original.owned.find(
          (p) =>
            !targetIds.has(p.id) &&
            p.type === type &&
            p.x === x &&
            p.y === y &&
            p.w === w &&
            p.h === h,
        );
        assert.ok(p, "Exact paid target item exists");
        targetIds.add(p.id);
      }
      const bridge = original.owned.filter(
        (p) => !targetIds.has(p.id) && C.placed(p),
      );
      assert.deepEqual(bridge.map((p) => p.type).sort(), [
        "ab_guestbook",
        "ab_heading",
      ]);
      const variants = POLICIES.map((policy) => {
        const run = structuredClone(original);
        const heldIds = bridge
          .filter((p) => policy.types.includes(p.type))
          .map((p) => p.id);
        for (const id of heldIds)
          assert.equal(
            R.move(run, id, null, null),
            true,
            "Public editor move into hand",
          );
        // Conservation checks occur before battle phase changes. Every property
        // except the explicitly held coordinates must be byte-for-byte identical.
        const expected = structuredClone(original);
        for (const p of expected.owned)
          if (heldIds.includes(p.id)) {
            p.x = null;
            p.y = null;
          }
        assert.deepEqual(run, expected);
        assert.ok(compositionProgress(run.owned, target).targetLayoutComplete);
        return fight(run, policy.id, heldIds);
      });
      const baseline = fight(structuredClone(original), "keep-all", []);
      assert.equal(
        baseline.winner,
        source.winner,
        "Original paid winner reproduced",
      );
      assert.equal(
        baseline.time,
        source.time,
        "Original paid timing reproduced",
      );
      return {
        seed: path.seed,
        firstCompletion: i === 0,
        source,
        // Same-round loot arrives only after this battle, so cannot justify an item here.
        transactions: path.transactions.filter(
          (t) =>
            t.round < source.round ||
            (t.round === source.round && ["buy", "reroll"].includes(t.kind)),
        ),
        baseline,
        variants,
      };
    });
  });
  return {
    note: "Five fixed, previously identified overloaded navigation paths, not a search or population sample. Editor-only counterfactuals replay every already-reached exact-completion snapshot against its actual legacy-expedition opponent. Real HP, admins, capacity, currency and inventory are preserved. Non-target does not mean useless. Alternatives are not settled and do not establish different later purchases, rewards, survival or campaign wins. Canonical story and laboratory conditions are not being measured.",
    rulesVersion: BATTLE_RULES_VERSION,
    seeds: [...SEEDS],
    target,
    paths: paths.map(
      ({ seed, cash, rewards, partSpend, serverSpend, rerollSpend }) => ({
        seed,
        cash,
        rewards,
        partSpend,
        serverSpend,
        rerollSpend,
      }),
    ),
    rows,
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  console.log(JSON.stringify(comparePaidBridgeCleanup(), null, 2));
