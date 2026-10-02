/* Build lab: live round-robin between the archetype builds and the campaign sites, using the
   real engine. Both sides get the same HP so the table shows the builds, not the HP curve. */
import D from "./data.js";
import C from "./document.js";
import E from "./engine.js";
import { BUILDS } from "./builds.js";
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
    ...BUILDS.map((b) => ({ id: b.id, name: b.name.replace("【理想形】", ""), build: true, layout: b.layout, admin: b.admin })),
    ...D.ENEMIES.filter((e) => !e.id.startsWith("b_")).map((e) => ({ id: e.id, name: e.name, build: false, layout: e.layout, admin: e.admin })),
  ];
}
export function board(layout: LayoutEntry[], prefix: string): Item[] {
  return layout.map(([t, x, y, w, h, shape, label], i) =>
    Object.assign(C.makeItem(t, prefix + i, x, y, w, h), shape ? { shape } : {}, label ? { label } : {}),
  );
}
export function match(a: Entrant, b: Entrant): Cell {
  const battle = new E.Battle(board(a.layout, "p"), board(b.layout, "e"), {
    playerHp: MATCH_HP,
    enemyHp: MATCH_HP,
    playerAdmin: a.admin,
    enemyAdmin: b.admin,
  });
  for (let t = 0; t < 1201 && !battle.result; t++) battle.step(0.05);
  return {
    winner: battle.result?.winner ?? "draw",
    time: battle.elapsed,
    hpA: battle.player.hp / battle.player.maxHp,
    hpB: battle.enemy.hp / battle.enemy.maxHp,
  };
}
export function roundRobin(list = entrants()): { list: Entrant[]; cells: (Cell | null)[][]; wins: number[] } {
  const cells = list.map((a) => list.map((b) => (a === b ? null : match(a, b))));
  const wins = cells.map((row) => row.filter((c) => c?.winner === "player").length);
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
    sets: a.sets.map((s) => `${D.FACTIONS[s.faction].name}×${s.count}`),
  };
}
