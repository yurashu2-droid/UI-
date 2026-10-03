/** Bounded authored probe, not a claim of global composition balance. */
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import C from "../src/document.js";
import E from "../src/engine.js";
import { acquisitionValue } from "../src/buildlab.js";
import D from "../src/data.js";
import type { Item } from "../src/types.js";
export function pressureFixture(investment = "go_jobs", defense = "none") {
  const attacker = [
    ...Array.from({length: 3}, (_, i) => C.makeItem("ab_nav", `content${i}`, 24, 24 + i * 36, 112, 24)),
    C.makeItem("go_ads", "income", 148, 24, 240, 72),
    C.makeItem(investment, "investment", 400, 24, 248, investment === "go_jobs" ? 112 : 48),
  ];
  const defender = Array.from({length: 3}, (_, i) => C.makeItem("yt_play", `video${i}`, 24 + i * 288, 24, 240, 144));
  if (defense === "recaptcha") defender.push(C.makeItem("go_recaptcha", "defense", 24, 200));
  return {attacker, defender};
}
export function pressureProbe(investment = "go_jobs", capacity = 15, hp = 440, defense = "none", adminSlots = 0, swap = false) {
  const {attacker, defender} = pressureFixture(investment, defense);
  const aAdmin = adminSlots ? ["server", "sns"] : [];
  const dAdmin = defense === "captcha" ? (adminSlots ? ["server", "captcha"] : ["captcha"]) : aAdmin;
  const battle = new E.Battle(swap ? defender : attacker, swap ? attacker : defender, {
    experimentalRules: "server-pressure-v1", playerHp: hp, enemyHp: hp,
    playerCapacity: capacity, enemyCapacity: capacity,
    playerAdmin: swap ? dAdmin : aAdmin, enemyAdmin: swap ? aAdmin : dAdmin,
  });
  while (!battle.result) battle.step(.05);
  const a = swap ? battle.enemy : battle.player, d = swap ? battle.player : battle.enemy;
  const resources = (items: Item[]) => ({cost: items.reduce((v,p) => v + acquisitionValue(p.type),0), cpu: items.reduce((v,p)=>v+D.PARTS[p.type].load,0), legal: items.every(p=>C.canPlace(items,p,p.x,p.y,p.w,p.h))});
  return {investment, capacity, hp, defense, attackerAdmin: aAdmin, defenderAdmin: dAdmin,
    attacker: resources(attacker), defender: resources(defender),
    winner: battle.result.winner === "draw" ? "draw" : battle.result.winner === a.name ? "attacker" : "defender",
    time: battle.elapsed, attackerHp: a.hp, defenderHp: d.hp,
    income: a.income, spent: battle.metrics[a.name].spent, unconverted: battle.metrics[a.name].unconverted,
    remainingCharge: a.parts.reduce((v,p)=>v+p.charge,0),
    acceptedWork: battle.pressure![a.name].sources.get("investment")?.accepted ?? 0,
    rejectedWaves: battle.pressure![a.name].sources.get("investment")?.blocked ?? 0,
    overloadLoss: d.lagLoss ?? 0};
}
export function runPressureStudy() {
  const rows = [];
  for (const hp of [160,440]) for (const admin of [0,2]) for (const capacity of [15,20,26,38])
    for (const investment of ["go_jobs","gov_pdf"]) rows.push(pressureProbe(investment,capacity,hp,"none",admin));
  for (const defense of ["captcha","recaptcha"]) for (const admin of [0,2]) rows.push(pressureProbe("go_jobs",15,440,defense,admin));
  return {scope: "Opt-in local simulation; authored equal-$21 core pair. Defenses show their added cost/slot explicitly. No open-composition balance claim.", rows};
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(JSON.stringify(runPressureStudy(),null,2));
