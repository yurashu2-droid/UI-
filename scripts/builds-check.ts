/* Validate the archetype builds (placement + which synergies actually connect) and run a
   round-robin between them and the campaign sites.  npx tsx scripts/builds-check.ts [--quiet] */
import D from "../src/data.js";
import C from "../src/document.js";
import E from "../src/engine.js";
import { BUILDS } from "../src/builds.js";
import type { Item, LayoutEntry } from "../src/types.js";

const quiet = process.argv.includes("--quiet");
function board(layout: LayoutEntry[], prefix: string): Item[] {
  return layout.map(([t, x, y, w, h, shape, label], i) =>
    Object.assign(C.makeItem(t, prefix + i, x, y, w, h), shape ? { shape } : {}, label ? { label } : {}),
  );
}
let bad = 0;
for (const b of BUILDS) {
  const items = board(b.layout, "p");
  for (const it of items)
    if (!C.canPlace(items, it, it.x, it.y, it.w, it.h)) {
      bad++;
      console.log(`✗ ${b.id}: illegal placement ${it.type} @${it.x},${it.y} ${it.w}x${it.h}`);
    }
  const a = E.analyze(items);
  if (quiet) continue;
  console.log(`\n== ${b.name}  load ${a.load}  free ${(a.freeRatio * 100).toFixed(0)}%  sets ${a.sets.map((s) => s.faction + s.count).join(",")}`);
  console.log("  groups: " + a.groups.map((g) => `${g.kind}[${g.items.map((id) => items.find((q) => q.id === id)!.type).join(",")}]`).join("  "));
  for (const it of items) {
    const m = a.mods[it.id],
      d = D.PARTS[it.type];
    if (!d.cd) continue;
    console.log(`  ${it.type.padEnd(14)} ${d.kind.padEnd(7)} spd×${m.speed.toFixed(2)} pow×${m.power.toFixed(2)} pierce ${m.pierce}  ${m.notes.join(" / ")}`);
  }
}
if (bad) process.exitCode = 1;

type Side = { name: string; layout: LayoutEntry[]; admin: string[]; hp: number };
const sides: Side[] = [
  ...BUILDS.map((b) => ({ name: b.name.replace("【理想形】", ""), layout: b.layout, admin: b.admin, hp: 440 })),
  ...D.ENEMIES.slice(0, 5).map((e) => ({ name: e.name, layout: e.layout, admin: e.admin, hp: 440 })),
];
function fight(a: Side, b: Side) {
  const battle = new E.Battle(board(a.layout, "p"), board(b.layout, "e"), {
    playerHp: a.hp,
    enemyHp: b.hp,
    playerAdmin: a.admin,
    enemyAdmin: b.admin,
  });
  for (let t = 0; t < 1201 && !battle.result; t++) battle.step(0.05);
  return { winner: battle.result!.winner, time: battle.elapsed, hpA: battle.player.hp / battle.player.maxHp, hpB: battle.enemy.hp / battle.enemy.maxHp, top: [...battle.player.parts].sort((x, y) => y.damage - x.damage).slice(0, 2).map((p) => `${p.type}:${Math.round(p.damage)}`) };
}
console.log("\n== round robin (row = player, both 440 HP, own admin) ==");
const header = ["".padEnd(14), ...sides.map((s) => s.name.slice(0, 6).padEnd(8))].join("");
console.log(header);
const wins: Record<string, number> = {};
for (const a of sides) {
  let line = a.name.slice(0, 12).padEnd(14);
  for (const b of sides) {
    if (a === b) {
      line += "  —     ";
      continue;
    }
    const r = fight(a, b);
    if (r.winner === "player") wins[a.name] = (wins[a.name] || 0) + 1;
    line += (r.winner === "player" ? "W" : r.winner === "draw" ? "D" : "L") + `${r.time.toFixed(0)}s`.padEnd(7);
  }
  console.log(line);
}
console.log("\nwins:", Object.entries(wins).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} ${v}`).join(" / "));
for (const a of sides.slice(0, BUILDS.length)) {
  const r = fight(a, sides[BUILDS.length + 4]);
  console.log(`vs YouTube: ${a.name.padEnd(10)} ${r.winner} ${r.time.toFixed(1)}s hp ${(r.hpA * 100).toFixed(0)}%/${(r.hpB * 100).toFixed(0)}%  top ${r.top.join(" ")}`);
}
