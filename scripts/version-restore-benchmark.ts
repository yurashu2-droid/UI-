/** Effect-isolation sweep only; the proposed go_history definition remains outside production. */
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import D from "../src/data.js";
import E from "../src/engine.js";
import { BUILDS } from "../src/builds.js";
import {
  board,
  resources,
  fusedEntrant,
  type Entrant,
} from "../src/buildlab.js";
import {
  VersionRestoreBattle,
  type RestoreConfig,
} from "./experiments/version-restore.js";
const entrant = (id: string): Entrant => {
  if (id === "probe_ad_converter") {
    const b = entrant("b_documents_heavy");
    return {
      ...b,
      id,
      layout: [
        ...b.layout,
        ["ad_retarget", 312, 568, 280, 80],
        ["am_cart", 600, 568, 280, 100],
      ],
    };
  }
  if (id === "b_cart-fused") return fusedEntrant(entrant("b_cart")).entrant;
  const b = BUILDS.find((b) => b.id === id);
  if (!b) throw Error("Unknown example");
  return {
    ...b,
    build: true,
    layout: b.layout.filter((r) => D.PARTS[r[0]].status !== "experimental"),
  };
};
export function compareRestoreCase(
  defender: string,
  opponent: string,
  config: RestoreConfig | null,
  hp = 440,
  activationPhase = 0.5,
) {
  const a = entrant(defender),
    b = entrant(opponent);
  const y = (
    {
      b_fort_native: 404,
      b_documents_heavy: 568,
      b_video_checkout: 444,
      b_cart: 536,
      probe_ad_converter: 568,
    } as Record<string, number>
  )[defender];
  a.layout = [...a.layout, ["gov_notice", 24, y, 280, 112]];
  const r = resources(a.layout);
  assert.equal(r.legal, true);
  const fight = (reverse: boolean) => {
    const ab = board(a.layout, "a"),
      bb = board(b.layout, "b"),
      slot = ab.at(-1)!.id;
    const options = {
      playerHp: hp,
      enemyHp: hp,
      playerCapacity: 35,
      enemyCapacity: 35,
      playerAdmin: [],
      enemyAdmin: [],
    };
    const battle = config
      ? new VersionRestoreBattle(
          reverse ? bb : ab,
          reverse ? ab : bb,
          options,
          {
            config,
            slots: reverse
              ? { player: [], enemy: [slot] }
              : { player: [slot], enemy: [] },
          },
        )
      : new E.Battle(reverse ? bb : ab, reverse ? ab : bb, options);
    const restoreSide = reverse ? battle.enemy : battle.player;
    const slotPart = restoreSide.parts.find((p) => p.id === slot)!;
    slotPart.remaining = slotPart.period * activationPhase;
    while (!battle.result) battle.step(0.05);
    const side = reverse ? battle.enemy : battle.player,
      foe = reverse ? battle.player : battle.enemy;
    const winner =
      battle.result.winner === "draw"
        ? "draw"
        : battle.result.winner === (reverse ? "enemy" : "player")
          ? "defender"
          : "opponent";
    return {
      winner,
      time: battle.elapsed,
      hp: side.hp / side.maxHp,
      opponentHp: foe.hp / foe.maxHp,
      slotHealing: side.parts.find((p) => p.id === slot)!.healed,
      income: side.income,
      conversionSpent: battle.metrics[side.name].spent,
      slotFires: side.parts.find((p) => p.id === slot)!.fires,
      totalHealing: battle.metrics[side.name].healing,
      ...(battle instanceof VersionRestoreBattle
        ? { restoreStats: battle.restoreStats[side.name] }
        : {}),
    };
  };
  const result = fight(false),
    reverse = fight(true);
  return {
    defender,
    opponent,
    baseHp: hp,
    activationPhase,
    variant: config ? "restore" : "notice",
    config,
    resources: {
      cost: r.acquisitionValue,
      load: r.load,
      slotCost: 5,
      proposedExtraPrice: 1,
    },
    ...result,
    reverse,
    seatConsistent:
      result.winner === reverse.winner &&
      Math.abs(result.hp - reverse.hp) < 1e-8 &&
      Math.abs(result.slotHealing - reverse.slotHealing) < 1e-8,
  };
}
export function runRestoreSweep() {
  const configs: RestoreConfig[] = [];
  for (const fraction of [0.25, 0.35, 0.5])
    for (const cap of [8, 12])
      for (const cooldown of [3, 5])
        for (const includePierce of [false, true])
          for (const zeroClears of [false, true])
            configs.push({
              fraction,
              cap,
              cooldown,
              includePierce,
              zeroClears,
              stopAtOverload: true,
            });
  const defenders = [
    "b_fort_native",
    "b_documents_heavy",
    "b_video_checkout",
    "b_cart",
  ];
  const opponents = [
    "b_links",
    "b_text",
    "b_cart",
    "b_cart-fused",
    "b_documents_heavy",
    "b_fort_native",
  ];
  const baselines = defenders.flatMap((d) =>
    opponents.flatMap((o) =>
      [440, 1200].map((hp) => compareRestoreCase(d, o, null, hp)),
    ),
  );
  const rows = configs.flatMap((c) =>
    baselines.map((b) => {
      const r = compareRestoreCase(b.defender, b.opponent, c, b.baseHp);
      return {
        ...r,
        baselineHealing: b.slotHealing,
        healingDelta: r.slotHealing - b.slotHealing,
        price6EfficiencyDelta: r.slotHealing / 6 - b.slotHealing / 5,
        baselineHp: b.hp,
        baselineTime: b.time,
        hpDelta: r.hp - b.hp,
        timeDelta: r.time - b.time,
        baselineWinner: b.winner,
        winnerChanged: r.winner !== b.winner,
      };
    }),
  );
  const overloadSensitivity = configs
    .filter(
      (c) =>
        ((c.fraction === 0.5 && c.cap === 12) ||
          (c.fraction === 0.35 && c.cap === 8)) &&
        c.cooldown === 5 &&
        c.zeroClears,
    )
    .flatMap((c) =>
      baselines
        .filter((b) => b.baseHp === 1200)
        .map((b) =>
          compareRestoreCase(
            b.defender,
            b.opponent,
            { ...c, stopAtOverload: false },
            b.baseHp,
          ),
        ),
    );
  const selected: RestoreConfig = {
    fraction: 0.5,
    cap: 12,
    cooldown: 5,
    includePierce: false,
    zeroClears: true,
    stopAtOverload: false,
  };
  const phaseSensitivity = baselines.flatMap((b) =>
    [0.25, 0.75, 1].map((phase) => {
      const normal = compareRestoreCase(
          b.defender,
          b.opponent,
          null,
          b.baseHp,
          phase,
        ),
        r = compareRestoreCase(
          b.defender,
          b.opponent,
          selected,
          b.baseHp,
          phase,
        );
      return {
        ...r,
        baseline: normal,
        healingDelta: r.slotHealing - normal.slotHealing,
        hpDelta: r.hp - normal.hp,
        timeDelta: r.time - normal.time,
      };
    }),
  );
  const economySensitivity = opponents.flatMap((o) =>
    [440, 1200].map((hp) => {
      const normal = compareRestoreCase("probe_ad_converter", o, null, hp),
        r = compareRestoreCase("probe_ad_converter", o, selected, hp);
      return {
        ...r,
        baseline: normal,
        healingDelta: r.slotHealing - normal.slotHealing,
        hpDelta: r.hp - normal.hp,
        timeDelta: r.time - normal.time,
      };
    }),
  );
  const summary = configs.map((config) => {
    const selected = rows.filter(
      (r) => JSON.stringify(r.config) === JSON.stringify(config),
    );
    return {
      config,
      cases: selected.length,
      meanHealingDelta:
        selected.reduce((s, r) => s + r.healingDelta, 0) / selected.length,
      betterHealing: selected.filter((r) => r.healingDelta > 1e-8).length,
      worseHealing: selected.filter((r) => r.healingDelta < -1e-8).length,
      betterAtPrice6: selected.filter((r) => r.price6EfficiencyDelta > 1e-8)
        .length,
      winnerChanges: selected.filter((r) => r.winnerChanged).length,
      defenderWins: selected.filter((r) => r.winner === "defender").length,
    };
  });
  return {
    note: "Quarantined simulation-only notice-slot substitution; canonical engine/catalogue/versions unchanged. Same $5/CPU2 resources and geometry. $6 comparison is output-per-price only, not a paid acquisition route. Google faction effects are NOT established by this probe. Both replacements occupy the proposed280x112 footprint; document-native contexts let notice earn its actual adjacency bonus. Record expires after5s. Empty polls do not fire or create income; successful restore dispatches use normal notifications. stopAtOverload is an extra conservative restriction, separately compared with eligible-enemy-hit-only restoration after45s.",
    baselines,
    summary,
    rows,
    overloadSensitivity,
    phaseSensitivity,
    economySensitivity,
    orderedMatches:
      2 * (baselines.length + rows.length + overloadSensitivity.length) +
      4 * (phaseSensitivity.length + economySensitivity.length),
    seatMismatches: [
      ...baselines,
      ...rows,
      ...overloadSensitivity,
      ...phaseSensitivity,
      ...economySensitivity,
      ...phaseSensitivity.map((r) => r.baseline),
      ...economySensitivity.map((r) => r.baseline),
    ].filter((r) => !r.seatConsistent).length,
  };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  console.log(JSON.stringify(runRestoreSweep(), null, 2));
