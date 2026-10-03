/** Bounded, reproducible composition search. Completed-board evidence is not paid-route evidence. */
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import D from "../src/data.js";
import C from "../src/document.js";
import E from "../src/engine.js";
import {
  isSupportedCombatVersion,
  type CombatRulesVersion,
} from "../src/combat-rules.js";
import R from "../src/run.js";
import { RECIPES } from "../src/fusion.js";
import { BUILDS } from "../src/builds.js";
import {
  acquisitionValue,
  board,
  resources,
  fusedEntrant,
} from "../src/buildlab.js";
import { completedFusionBuilds } from "./completed-fusion-builds.js";
import type { LayoutEntry } from "../src/types.js";

export interface Limits {
  combatVersion?: CombatRulesVersion;
  budget: number;
  capacity: number;
  /** Independent admission bound; above capacity is legal but incurs real engine overload. */
  maxLoad?: number;
  hp: number;
  adminSlots: number;
  footprint: number;
  productionOnly: boolean;
}
export interface Candidate {
  id: string;
  origin: string;
  layout: LayoutEntry[];
  admin: string[];
}
export const DEFAULT_LIMITS: Limits = {
  budget: 75,
  capacity: 26,
  hp: 440,
  adminSlots: 2,
  footprint: D.WIDTH * D.HEIGHT,
  productionOnly: true,
};
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
type Random = ReturnType<typeof rng>;
const pick = <T>(xs: T[], r: Random): T => xs[Math.floor(r() * xs.length)];
const clone = (c: Candidate): Candidate => ({
  ...c,
  layout: c.layout.map((r) => [...r]),
  admin: [...c.admin],
});
export function compositionKey(c: Candidate) {
  return c.layout
    .map((r) => r[0])
    .sort()
    .join("/");
}
function key(c: Candidate) {
  return JSON.stringify([
    c.layout
      .map((r) => r.slice(0, 5))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    [...c.admin].sort(),
  ]);
}
export function catalogueTypes(limits: Limits) {
  return Object.keys(D.PARTS).filter(
    (t) => !limits.productionOnly || D.PARTS[t].status !== "experimental",
  );
}
export function assessCandidate(c: Candidate, limits: Limits) {
  const known = c.layout.every((r) => Object.hasOwn(D.PARTS, r[0]));
  const base = known
    ? resources(c.layout)
    : {
        legal: false,
        acquisitionValue: Infinity,
        load: Infinity,
        footprint: Infinity,
        experimental: ["unknown"],
      };
  const legal =
    c.layout.length > 0 &&
    known &&
    base.legal &&
    c.layout.every((r) => r[1] !== null && r[2] !== null) &&
    base.acquisitionValue <= limits.budget &&
    base.load <= (limits.maxLoad ?? limits.capacity) &&
    base.footprint <= limits.footprint &&
    (!limits.productionOnly || base.experimental.length === 0) &&
    c.admin.length <= limits.adminSlots &&
    new Set(c.admin).size === c.admin.length &&
    c.admin.every((a) => Object.hasOwn(D.ADMIN, a));
  return {
    legal,
    cost: base.acquisitionValue,
    load: base.load,
    footprint: base.footprint,
    fused: c.layout.filter((r) => D.PARTS[r[0]]?.fused).map((r) => r[0]),
    experimental: base.experimental,
  };
}
/** A public-transaction witness for each recipe; sequential inventory construction is not a campaign. */
export function fusionWitness(type: string) {
  const recipe = RECIPES.find((r) => r.into === type);
  if (!recipe) throw Error("No recipe: " + type);
  const a = D.PARTS[recipe.a],
    b = D.PARTS[recipe.b];
  const donors: LayoutEntry[] = [
    [recipe.a, 16, 16, a.minW, a.minH],
    [recipe.b, 16 + a.minW, 16, b.minW, b.minH],
  ];
  const run = R.newRun("lab");
  run.owned = board(donors, "donor");
  run.nextId = 10;
  const donorLegal = resources(donors).legal;
  assert.ok(donorLegal);
  const fs = R.fuse(run, { pair: ["donor0", "donor1"] });
  assert.equal(fs.length, 1);
  assert.equal(fs[0].recipe.into, type);
  assert.equal(run.owned.length, 1);
  return {
    output: type,
    consumed: [recipe.a, recipe.b],
    donors,
    donorLegal,
    fusions: fs.length,
    inputValue: acquisitionValue(recipe.a) + acquisitionValue(recipe.b),
  };
}
export function adminChoices(slots: number) {
  const ids = Object.keys(D.ADMIN),
    out: string[][] = [];
  function visit(start: number, own: string[]) {
    if (own.length === slots) {
      out.push(own);
      return;
    }
    for (let i = start; i < ids.length; i++) visit(i + 1, [...own, ids[i]]);
  }
  visit(0, []);
  return out;
}
function dimensions(type: string, r: Random): [number, number] {
  const d = D.PARTS[type];
  // Legal size variation includes large support controls. Their opportunity cost is measured footprint.
  const w = pick(
    [d.minW, d.w, Math.min(d.maxW, d.w + 160), Math.min(d.maxW, 640)],
    r,
  );
  const h = pick([d.minH, d.h, d.h, Math.min(d.maxH, d.h + 80)], r);
  return [w, h];
}
function place(
  layout: LayoutEntry[],
  type: string,
  r: Random,
  size?: [number, number],
): LayoutEntry | null {
  const items = board(layout, "place"),
    [w, h] = size ?? dimensions(type, r),
    item = C.makeItem(type, "new", null, null, w, h);
  const spots: [number, number][] = [[16, 16]];
  for (const p of items) {
    const x = p.x!,
      y = p.y!;
    for (const gap of [0, 8, 16])
      spots.push(
        [x + p.w + gap, y],
        [x, y + p.h + gap],
        [x - w - gap, y],
        [x, y - h - gap],
      );
    if (D.PARTS[p.type].container) {
      const b = C.inner(p);
      spots.push([b.x, b.y], [b.x + b.w - w, b.y + b.h - h]);
    }
  }
  for (let i = 0; i < 12; i++)
    spots.push([
      Math.floor((r() * (D.WIDTH - w)) / 8) * 8,
      Math.floor((r() * (D.HEIGHT - h)) / 8) * 8,
    ]);
  for (let i = spots.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [spots[i], spots[j]] = [spots[j], spots[i]];
  }
  const p = spots.find(([x, y]) => C.canPlace(items, item, x, y, w, h));
  return p ? [type, p[0], p[1], w, h] : null;
}
function mutate(
  c: Candidate,
  limits: Limits,
  r: Random,
  serial: number,
): Candidate | null {
  const next = clone(c),
    types = catalogueTypes(limits),
    op = Math.floor(r() * 8);
  next.id = `candidate-${serial}`;
  if (op === 0 && next.layout.length > 1)
    next.layout.splice(Math.floor(r() * next.layout.length), 1);
  else if (op === 1) next.admin = pick(adminChoices(limits.adminSlots), r);
  else if ((op === 2 || op === 3) && next.layout.length) {
    const i = Math.floor(r() * next.layout.length),
      old = next.layout.splice(i, 1)[0];
    const type = op === 2 ? old[0] : pick(types, r);
    const entry = place(
      next.layout,
      type,
      r,
      op === 2 && r() < 0.5 ? [old[3]!, old[4]!] : undefined,
    );
    if (entry) next.layout.push(entry);
    else return null;
  } else if (op === 4 && next.layout.length) {
    const i = Math.floor(r() * next.layout.length),
      old = next.layout[i];
    const [w, h] = dimensions(old[0], r);
    next.layout[i] = [old[0], old[1], old[2], w, h];
  } else {
    const type =
      next.layout.length && r() < 0.35
        ? pick(next.layout, r)[0]
        : pick(types, r);
    const entry = place(next.layout, type, r);
    if (!entry) return null;
    next.layout.push(entry);
  }
  return assessCandidate(next, limits).legal && key(next) !== key(c)
    ? next
    : null;
}
function seedCandidates(limits: Limits, r: Random) {
  const authored = BUILDS.flatMap((b) => [
    b,
    fusedEntrant({ ...b, build: true }).entrant,
  ]);
  const completed = completedFusionBuilds().map((x) => x.entrant);
  const out: Candidate[] = [];
  for (const source of [...authored, ...completed]) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const c: Candidate = {
        id: `${source.id}-${attempt}`,
        origin: source.id,
        layout: source.layout.map((r) => [...r]),
        admin:
          attempt === 0
            ? source.admin.slice(0, limits.adminSlots)
            : pick(adminChoices(limits.adminSlots), r),
      };
      while (c.layout.length > 1 && !assessCandidate(c, limits).legal)
        c.layout.splice(Math.floor(r() * c.layout.length), 1);
      if (assessCandidate(c, limits).legal) out.push(c);
    }
  }
  // Every production attack starts its own independent lineage, including no authored compositions.
  for (const type of catalogueTypes(limits).filter((t) =>
    ["attack", "reactive"].includes(D.PARTS[t].kind),
  )) {
    const d = D.PARTS[type],
      c: Candidate = {
        id: `fresh-${type}`,
        origin: `fresh-${type}`,
        layout: [[type, 16, 16, d.minW, d.minH]],
        admin: pick(adminChoices(limits.adminSlots), r),
      };
    // Independent full-budget starts avoid treating a single weak part as a meaningful adversary.
    for (
      let attempt = 0;
      attempt < 60 && assessCandidate(c, limits).cost < limits.budget - 5;
      attempt++
    ) {
      const extra = r() < 0.3 ? type : pick(catalogueTypes(limits), r),
        entry = place(c.layout, extra, r);
      if (
        entry &&
        assessCandidate({ ...c, layout: [...c.layout, entry] }, limits).legal
      )
        c.layout.push(entry);
    }
    if (assessCandidate(c, limits).legal) out.push(c);
  }
  return out;
}
export function generateCandidates(
  seed: number,
  limits = DEFAULT_LIMITS,
  count = 100,
) {
  const r = rng(seed),
    pool = seedCandidates(limits, r),
    seen = new Set<string>(),
    out: Candidate[] = [];
  for (let serial = 0; out.length < count && serial < count * 40; serial++) {
    let c = clone(pick(pool, r));
    for (let i = 0; i < 1 + Math.floor(r() * 5); i++)
      c = mutate(c, limits, r, serial * 8 + i) ?? c;
    if (seen.has(key(c))) continue;
    seen.add(key(c));
    out.push(c);
    pool.push(c);
  }
  return out;
}
export function duel(
  a: Candidate,
  b: Candidate,
  limits: Limits,
  BattleClass: typeof E.Battle = E.Battle,
) {
  const battle = new BattleClass(board(a.layout, "a"), board(b.layout, "b"), {
    combatVersion: limits.combatVersion,
    playerHp: limits.hp,
    enemyHp: limits.hp,
    playerCapacity: limits.capacity,
    enemyCapacity: limits.capacity,
    playerAdmin: a.admin,
    enemyAdmin: b.admin,
  });
  for (let i = 0; i < 1201 && !battle.result; i++) battle.step(0.05);
  assert.ok(battle.result);
  return {
    rulesVersion: battle.combatVersion,
    winner:
      battle.result.winner === "player"
        ? ("a" as const)
        : battle.result.winner === "enemy"
          ? ("b" as const)
          : ("draw" as const),
    margin:
      battle.player.hp / battle.player.maxHp -
      battle.enemy.hp / battle.enemy.maxHp,
    time: battle.elapsed,
    hpA: battle.player.hp,
    hpB: battle.enemy.hp,
    maxHpA: battle.player.maxHp,
    maxHpB: battle.enemy.maxHp,
  };
}
interface Scored {
  candidate: Candidate;
  resources: ReturnType<typeof assessCandidate>;
  margins: number[];
  wins: number;
  draws: number;
  score: number;
}
export function paretoFront<
  T extends {
    resources: { cost: number; load: number; footprint: number };
    margins: number[];
  },
>(rows: T[]) {
  return rows.filter(
    (a, i) =>
      !rows.some((b, j) => {
        if (i === j || a.margins.length !== b.margins.length) return false;
        const av = [
            -a.resources.cost,
            -a.resources.load,
            -a.resources.footprint,
            ...a.margins,
          ],
          bv = [
            -b.resources.cost,
            -b.resources.load,
            -b.resources.footprint,
            ...b.margins,
          ];
        return (
          bv.every((v, k) => v >= av[k] - 1e-9) &&
          bv.some((v, k) => v > av[k] + 1e-9)
        );
      }),
  );
}
/** Greedy conservative simplification: accept only removals no worse against every named opponent. */
export function refineRemovals<
  T extends {
    candidate: Candidate;
    resources: { cost: number; load: number; footprint: number };
    margins: number[];
  },
>(initial: T, evaluate: (c: Candidate) => T, limits: Limits) {
  let best = initial;
  const removed: { type: string; costSaved: number }[] = [];
  for (;;) {
    let next: T | undefined;
    for (let i = 0; i < best.candidate.layout.length; i++) {
      const part = best.candidate.layout[i],
        c = {
          ...best.candidate,
          id: best.candidate.id + `-drop${i}`,
          layout: best.candidate.layout.filter((_, j) => i !== j),
        };
      if (!assessCandidate(c, limits).legal) continue;
      const row = evaluate(c);
      if (
        row.margins.every((m, j) => m >= best.margins[j] - 1e-9) &&
        paretoFront([best, row]).length === 1
      ) {
        removed.push({ type: part[0], costSaved: acquisitionValue(part[0]) });
        next = row;
        break;
      }
    }
    if (!next) return { row: best, removed };
    best = next;
  }
}
function primary(c: Candidate) {
  const totals: Record<string, number> = {};
  for (const [type] of c.layout)
    if (D.PARTS[type].kind === "attack") totals[type] = (totals[type] ?? 0) + 1;
  return (
    Object.entries(totals).sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    )[0]?.[0] ?? "no-attack"
  );
}
function diverse(rows: Scored[], n: number) {
  const sorted = [...rows].sort(
      (a, b) => b.score - a.score || a.resources.cost - b.resources.cost,
    ),
    out: Scored[] = [],
    seen = new Set<string>();
  const add = (row: Scored) => {
    const k = key(row.candidate);
    if (!seen.has(k) && out.length < n) {
      out.push(row);
      seen.add(k);
    }
  };
  const species = new Set<string>();
  for (const row of sorted)
    if (!species.has(primary(row.candidate))) {
      species.add(primary(row.candidate));
      add(row);
    }
  const compositions = new Set(out.map((r) => compositionKey(r.candidate)));
  for (const row of sorted)
    if (!compositions.has(compositionKey(row.candidate))) {
      compositions.add(compositionKey(row.candidate));
      add(row);
    }
  for (const row of sorted) add(row);
  return out.sort((a, b) => b.score - a.score);
}
export function runSearch(
  seed = 20261002,
  limits = DEFAULT_LIMITS,
  iterations = 600,
  BattleClass: typeof E.Battle = E.Battle,
) {
  const r = rng(seed),
    cache = new Map<string, ReturnType<typeof duel>>(),
    seen = new Map<string, Candidate>();
  let battles = 0;
  const fight = (a: Candidate, b: Candidate) => {
    const k = key(a) + "|" + key(b);
    let result = cache.get(k);
    if (!result) {
      result = duel(a, b, limits, BattleClass);
      cache.set(k, result);
      battles++;
    }
    return result;
  };
  const score = (c: Candidate, opponents: Candidate[]): Scored => {
    const games = opponents.map((o) => fight(c, o)),
      margins = games.map((g) => g.margin),
      wins = games.filter((g) => g.winner === "a").length,
      draws = games.filter((g) => g.winner === "draw").length;
    return {
      candidate: c,
      resources: assessCandidate(c, limits),
      margins,
      wins,
      draws,
      score:
        (wins + 0.5 * draws) / games.length +
        (0.22 * margins.reduce((a, b) => a + b, 0)) / margins.length +
        0.08 * Math.min(...margins),
    };
  };
  const seeds = seedCandidates(limits, r);
  // Stable, varied reference set: one resource-feasible seed per origin, plus evolving search opponents.
  const anchors = seeds.filter(
    (c, i) =>
      !c.origin.startsWith("fresh-") &&
      !seeds.slice(0, i).some((a) => a.origin === c.origin),
  );
  let pool = anchors,
    population = diverse(
      seeds.map((c) => score(c, pool)),
      28,
    ),
    hall = population.map((r) => r.candidate);
  const checkpoints: {
    evaluated: number;
    leaders: {
      id: string;
      origin: string;
      score: number;
      wins: number;
      opponents: number;
    }[];
  }[] = [];
  for (const c of seeds) seen.set(key(c), c);
  for (let generation = 0; generation * 100 < iterations; generation++) {
    const batch: Candidate[] = [];
    for (
      let attempt = 0;
      batch.length < Math.min(100, iterations - generation * 100) &&
      attempt < 8000;
      attempt++
    ) {
      const parent =
        attempt % 5 === 0 ? pick(seeds, r) : pick(population, r).candidate;
      let c = clone(parent);
      for (let i = 0; i < 1 + Math.floor(r() * 4); i++)
        c = mutate(c, limits, r, generation * 100000 + attempt * 8 + i) ?? c;
      if (seen.has(key(c))) continue;
      seen.set(key(c), c);
      batch.push(c);
    }
    population = diverse(
      [...population.map((p) => p.candidate), ...batch].map((c) =>
        score(c, pool),
      ),
      28,
    );
    hall = diverse(
      [...hall, ...population.map((p) => p.candidate)].map((c) =>
        score(c, pool),
      ),
      24,
    ).map((p) => p.candidate);
    pool = [...anchors, ...hall.slice(0, 10)];
    checkpoints.push({
      evaluated: seen.size,
      leaders: population.slice(0, 4).map((p) => ({
        id: p.candidate.id,
        origin: p.candidate.origin,
        score: p.score,
        wins: p.wins,
        opponents: p.margins.length,
      })),
    });
  }
  // All surviving layouts get exactly the same exhaustive administrator opportunity.
  const choices = adminChoices(limits.adminSlots),
    beforeAdmin = diverse(
      hall.map((c) => score(c, pool)),
      12,
    );
  const optimized = beforeAdmin.map(
    (row) =>
      choices
        .map((admin) => score({ ...row.candidate, admin }, pool))
        .sort((a, b) => b.score - a.score)[0],
  );
  const refinementPool = [...anchors, ...optimized.map((p) => p.candidate)];
  const refinements = optimized.map((row) =>
    refineRemovals(
      score(row.candidate, refinementPool),
      (c) => score(c, refinementPool),
      limits,
    ),
  );
  const refined = refinements.map(
    ({ row }) =>
      choices
        .map((admin) => score({ ...row.candidate, admin }, refinementPool))
        .sort((a, b) => b.score - a.score)[0],
  );
  const finalPool = [...anchors, ...refined.map((p) => p.candidate)];
  const finalists = refined
    .map((row) => score(row.candidate, finalPool))
    .sort((a, b) => b.score - a.score);
  const finalFront = paretoFront(finalists);
  const seatMismatches = finalists.flatMap((row) =>
    finalPool.flatMap((o) => {
      const a = fight(row.candidate, o),
        b = fight(o, row.candidate);
      return Math.abs(a.margin + b.margin) > 1e-9 ||
        a.time !== b.time ||
        (a.winner === "draw") !== (b.winner === "draw") ||
        (a.winner !== "draw" && a.winner === b.winner)
        ? [{ a: row.candidate.id, b: o.id, forward: a, reverse: b }]
        : [];
    }),
  );
  const ablations = finalists.slice(0, 4).map((row) => ({
    id: row.candidate.id,
    base: row.score,
    parts: row.candidate.layout.map((part, i) => {
      const c = {
        ...row.candidate,
        layout: row.candidate.layout.filter((_, j) => i !== j),
      };
      const result = score(c, finalPool);
      return {
        type: part[0],
        index: i,
        score: result.score,
        delta: result.score - row.score,
        wins: result.wins,
        costSaved: acquisitionValue(part[0]),
      };
    }),
  }));
  return {
    note: "Deterministic bounded heuristic search, not exhaustive optimal play or population win rates. Every admitted search candidate satisfies input-value/maxLoad/footprint/geometry/administrator limits. maxLoad defaults to battle capacity (an under-cap search, not the game's general legality rule); setting maxLoad higher permits engine overload. Authored examples are seeds, not fixed classes; independent full-budget random starts also participate. The twelve preselected survivors receive all legal admin choices and conservative non-worsening removals; rejected geometries do not receive exhaustive admin optimization. Frontier is only among these refined sampled finalists, not every candidate. Training anchors are authored regressions plus evolving champions, so held-out/cross-seed robustness is reported separately. This is not a Nash-equilibrium proof. Fusions retain recursive input value and public recipe witnesses, but completed inventories/admin loot and prior fusion battles are not a paid acquisition guarantee. No runtime balance values changed.",
    seed,
    combatProbe: BattleClass === E.Battle ? "canonical" : BattleClass.name,
    rulesVersion: cache.values().next().value?.rulesVersion,
    limits,
    iterations,
    evaluated: seen.size,
    battles,
    catalogue: catalogueTypes(limits),
    seenTypes: [
      ...new Set([...seen.values()].flatMap((c) => c.layout.map((r) => r[0]))),
    ].sort(),
    distinctCompositions: new Set([...seen.values()].map(compositionKey)).size,
    adminChoicesPerFinalist: choices.length,
    anchors: anchors.map((c) => ({
      ...c,
      resources: assessCandidate(c, limits),
    })),
    checkpoints,
    opponents: finalPool.map((c) => ({
      id: c.id,
      origin: c.origin,
      admin: c.admin,
    })),
    finalists,
    paretoIds: finalFront.map((r) => r.candidate.id),
    refinements: refinements.map(({ row, removed }) => ({
      id: row.candidate.id,
      removed,
    })),
    ablations,
    seatChecked: finalists.length * finalPool.length,
    seatMismatches,
    fusionWitnesses: [
      ...new Set(finalists.flatMap((r) => r.resources.fused)),
    ].map(fusionWitness),
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const arg = (name: string, fallback: number) =>
    Number(
      process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ??
        fallback,
    );
  const version = process.argv
    .find((a) => a.startsWith("--combat-version="))
    ?.split("=")[1];
  if (version !== undefined && !isSupportedCombatVersion(version))
    throw new Error("Unsupported search combat version");
  console.log(
    JSON.stringify(
      runSearch(
        arg("seed", 20261002),
        {
          ...DEFAULT_LIMITS,
          combatVersion: version,
          capacity: arg("capacity", 26),
          maxLoad: arg("max-load", arg("capacity", 26)),
          budget: arg("budget", 75),
          hp: arg("hp", 440),
        },
        arg("iterations", 600),
      ),
      null,
      2,
    ),
  );
}
