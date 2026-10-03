/* Build lab: live round-robin between the archetype builds and the campaign sites, using the
   real engine. Both sides get the same HP so the table shows the builds, not the HP curve. */
import D from "./data.js";
import C from "./document.js";
import R from "./run.js";
import E from "./engine.js";
import { BUILDS } from "./builds.js";
import { RECIPES } from "./fusion.js";
import { activeFactionSets } from "./app-guidance.js";
import type { ExperimentalRules } from "./experimental-combat.js";
import {
  BATTLE_RULES_VERSION,
  type CombatRulesVersion,
} from "./combat-rules.js";
import type { Item, LayoutEntry, Winner } from "./types.js";

export interface Entrant {
  id: string;
  name: string;
  build: boolean;
  layout: LayoutEntry[];
  admin: string[];
}
export interface Cell {
  winner: Winner;
  time: number;
  hpA: number;
  hpB: number;
}
export const MATCH_HP = 440;

export function entrants(): Entrant[] {
  return [
    ...BUILDS.map((b) => ({
      id: b.id,
      name: b.name.replace("【理想形】", ""),
      build: true,
      layout: b.layout,
      admin: b.admin,
    })),
    ...D.ENEMIES.filter((e) => !e.id.startsWith("b_")).map((e) => ({
      id: e.id,
      name: e.name,
      build: false,
      layout: e.layout,
      admin: e.admin,
    })),
  ];
}
export function board(layout: LayoutEntry[], prefix: string): Item[] {
  return layout.map(([t, x, y, w, h, shape, label], i) =>
    Object.assign(
      C.makeItem(t, prefix + i, x, y, w, h),
      shape ? { shape } : {},
      label ? { label } : {},
    ),
  );
}
export interface MatchConditions {
  hp: number;
  /** Explicit, shared CPU allowance. Infinity is a labelled showcase condition only. */
  capacity: number;
  adminSlots: number;
  commonAdmin?: string[];
  /** Explicit laboratory-only variant; absence preserves canonical combat. */
  experimentalRules?: ExperimentalRules;
  combatVersion?: CombatRulesVersion;
}
export const DEFAULT_CONDITIONS: MatchConditions = {
  hp: MATCH_HP,
  capacity: 56,
  adminSlots: 4,
};
/** Catalogue input value is a floor, not proof a board was obtainable in a particular run. */
export function acquisitionValue(
  type: string,
  seen = new Set<string>(),
): number {
  if (seen.has(type)) throw new Error("Cyclic fusion recipe: " + type);
  const d = D.PARTS[type];
  if (!d) throw new Error("Unknown part: " + type);
  if (!d.fused) return d.price;
  const next = new Set(seen).add(type);
  const choices = RECIPES.filter((r) => r.into === type);
  if (!choices.length) throw new Error("Missing fusion recipe: " + type);
  return Math.min(
    ...choices.map(
      (r) => acquisitionValue(r.a, next) + acquisitionValue(r.b, next),
    ),
  );
}
export function resources(layout: LayoutEntry[]) {
  const items = board(layout, "resource"),
    info = E.analyze(items);
  return {
    acquisitionValue: items.reduce((n, p) => n + acquisitionValue(p.type), 0),
    load: info.load,
    capWaste: info.capWaste,
    footprint: Math.round((1 - info.freeRatio) * D.WIDTH * D.HEIGHT),
    parts: items.length,
    experimental: [
      ...new Set(
        items
          .filter((p) => D.PARTS[p.type].status === "experimental")
          .map((p) => p.type),
      ),
    ],
    legal: items.every((p) => C.canPlace(items, p, p.x, p.y, p.w, p.h)),
  };
}
export function measureMatch(
  a: Entrant,
  b: Entrant,
  conditions: MatchConditions = DEFAULT_CONDITIONS,
) {
  const admin = (e: Entrant) =>
    (conditions.commonAdmin ?? e.admin).slice(0, conditions.adminSlots);
  const battle = new E.Battle(board(a.layout, "p"), board(b.layout, "e"), {
    playerHp: conditions.hp,
    enemyHp: conditions.hp,
    playerCapacity: conditions.capacity,
    enemyCapacity: conditions.capacity,
    playerAdmin: admin(a),
    enemyAdmin: admin(b),
    experimentalRules: conditions.experimentalRules,
    combatVersion: conditions.combatVersion,
  });
  const checkpoints: {
    time: number;
    a: typeof battle.metrics.player;
    b: typeof battle.metrics.enemy;
    hpA: number;
    hpB: number;
    incomeA: number;
    incomeB: number;
  }[] = [];
  for (let t = 0; t < 1201 && !battle.result; t++) {
    battle.step(0.05);
    if ([100, 300, 600, 900].includes(battle.ticks))
      checkpoints.push({
        time: battle.elapsed,
        a: { ...battle.metrics.player },
        b: { ...battle.metrics.enemy },
        hpA: battle.player.hp,
        hpB: battle.enemy.hp,
        incomeA: battle.player.income,
        incomeB: battle.enemy.income,
      });
  }
  if (!battle.result) throw new Error("Combat did not terminate");
  return {
    rulesVersion: battle.combatVersion,
    conditions: { ...conditions },
    winner: battle.result.winner,
    time: battle.elapsed,
    hpA: battle.player.hp / battle.player.maxHp,
    hpB: battle.enemy.hp / battle.enemy.maxHp,
    maxHpA: battle.player.maxHp,
    maxHpB: battle.enemy.maxHp,
    resourcesA: resources(a.layout),
    resourcesB: resources(b.layout),
    lagLossA: battle.player.lagLoss ?? 0,
    lagLossB: battle.enemy.lagLoss ?? 0,
    incomeA: battle.player.income,
    incomeB: battle.enemy.income,
    metricsA: { ...battle.metrics.player },
    metricsB: { ...battle.metrics.enemy },
    ...(battle.audience
      ? {
          audienceA: battle.audience.player.snapshot(),
          audienceB: battle.audience.enemy.snapshot(),
        }
      : {}),
    checkpoints,
  };
}
export function match(a: Entrant, b: Entrant): Cell {
  return measureMatch(a, b);
}
export function roundRobin(list = entrants()): {
  list: Entrant[];
  cells: (Cell | null)[][];
  wins: number[];
} {
  const cells = list.map((a) =>
    list.map((b) => (a === b ? null : match(a, b))),
  );
  const wins = cells.map(
    (row) => row.filter((c) => c?.winner === "player").length,
  );
  return { list, cells, wins };
}
/** Static analysis of a build: groups formed, set bonuses, load, and each attacker's final multipliers. */
export function inspect(layout: LayoutEntry[]) {
  const items = board(layout, "p"),
    a = E.analyze(items);
  return {
    load: a.load,
    free: a.freeRatio,
    groups: [...new Set(a.groups.map((g) => E.groupNames[g.kind] || g.kind))],
    sets: activeFactionSets(a).map((s) => `${D.FACTIONS[s.faction].name}×${s.count}`),
  };
}

/** Benchmark-only choice to accept currently available recipes; gameplay still exposes hold. */
export function fusedEntrant(a: Entrant) {
  const run = R.newRun("lab");
  run.owned = board(a.layout, "fusion");
  run.nextId = run.owned.length + 1;
  const fusions = R.fuse(run);
  const layout: LayoutEntry[] = run.owned.map((p) => [
    p.type,
    p.x,
    p.y,
    p.w,
    p.h,
    p.shape,
    p.label,
  ]);
  return {
    entrant: { ...a, id: a.id + "-fused", name: a.name + " / 合成後", layout },
    recipes: fusions.map((f) => f.recipe.into),
    held: run.owned.filter((p) => !C.placed(p)).length,
  };
}
