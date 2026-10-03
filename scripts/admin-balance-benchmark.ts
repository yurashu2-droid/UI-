/** Administrator-choice study. Completed layouts and equal slot counts, not a paid loot guarantee. */
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import D from "../src/data.js";
import E from "../src/engine.js";
import { BUILDS } from "../src/builds.js";
import {
  board,
  resources,
  fusedEntrant,
  type Entrant,
} from "../src/buildlab.js";
export interface AdminCondition {
  hp: number;
  capacity: number;
  fused: boolean;
}
export function adminPairs() {
  const ids = Object.keys(D.ADMIN);
  return ids.flatMap((a, i) => ids.slice(i + 1).map((b) => [a, b]));
}
const cache = new Map<
  string,
  { entrant: Entrant; recipes: string[]; cost: number; load: number }
>();
function prepared(id: string, fused: boolean) {
  const key = id + "/" + fused;
  if (cache.has(key)) return cache.get(key)!;
  const b = BUILDS.find((b) => b.id === id);
  if (!b) throw Error("Unknown build");
  const base = { ...b, build: true },
    result = fused ? fusedEntrant(base) : { entrant: base, recipes: [] };
  const r = resources(result.entrant.layout);
  if (!r.legal) throw Error("Illegal composed layout");
  const value = { ...result, cost: r.acquisitionValue, load: r.load };
  cache.set(key, value);
  return value;
}
function check(pair: string[]) {
  if (
    pair.length !== 2 ||
    new Set(pair).size !== 2 ||
    pair.some((id) => !Object.hasOwn(D.ADMIN, id))
  )
    throw Error("Choose two distinct actual admins");
}
export function runAdminDuel(
  counter: string,
  counterAdmin: string[],
  cartAdmin: string[],
  condition: AdminCondition,
  reverse = false,
) {
  check(counterAdmin);
  check(cartAdmin);
  const a = prepared(counter, condition.fused),
    b = prepared("b_cart", condition.fused),
    ab = board(a.entrant.layout, "a"),
    bb = board(b.entrant.layout, "b");
  const battle = new E.Battle(reverse ? bb : ab, reverse ? ab : bb, {
    playerHp: condition.hp,
    enemyHp: condition.hp,
    playerCapacity: condition.capacity,
    enemyCapacity: condition.capacity,
    playerAdmin: reverse ? cartAdmin : counterAdmin,
    enemyAdmin: reverse ? counterAdmin : cartAdmin,
  });
  while (!battle.result) battle.step(0.05);
  const own = reverse ? battle.enemy : battle.player,
    foe = reverse ? battle.player : battle.enemy;
  const winner =
    battle.result.winner === "draw"
      ? "draw"
      : battle.result.winner === own.name
        ? "counter"
        : "cart";
  return {
    counter,
    counterAdmin: [...counterAdmin],
    cartAdmin: [...cartAdmin],
    condition: { ...condition },
    winner,
    time: battle.elapsed,
    hpCounter: own.hp / own.maxHp,
    hpCart: foe.hp / foe.maxHp,
    margin: own.hp / own.maxHp - foe.hp / foe.maxHp,
    maxHpCounter: own.maxHp,
    maxHpCart: foe.maxHp,
    costCounter: a.cost,
    costCart: b.cost,
    loadCounter: a.load,
    loadCart: b.load,
    counterRecipes: a.recipes,
    cartRecipes: b.recipes,
  };
}
export function runAdminStudy() {
  const pairs = adminPairs(),
    conditions = [26, 35].flatMap((capacity) =>
      [false, true].map((fused) => ({ hp: 440, capacity, fused })),
    );
  const authoredCart = ["adnet", "server"];
  const fixed = conditions.flatMap((c) =>
    BUILDS.filter((b) => b.id !== "b_cart").flatMap((b) =>
      pairs.map((p) => runAdminDuel(b.id, p, authoredCart, c)),
    ),
  );
  const fixedSummary = conditions.flatMap((condition) =>
    BUILDS.filter((b) => b.id !== "b_cart").map((b) => {
      const rows = fixed
        .filter(
          (r) =>
            r.counter === b.id &&
            JSON.stringify(r.condition) === JSON.stringify(condition),
        )
        .sort((a, b) => b.margin - a.margin);
      return {
        counter: b.id,
        condition,
        wins: rows.filter((r) => r.winner === "counter").length,
        draws: rows.filter((r) => r.winner === "draw").length,
        best: rows[0],
      };
    }),
  );
  const expanded = conditions.flatMap((c) =>
    ["b_fort_native", "b_documents_heavy", "b_video_checkout"].flatMap((id) =>
      pairs.flatMap((own) => pairs.map((foe) => runAdminDuel(id, own, foe, c))),
    ),
  );
  const robust = conditions.flatMap((condition) =>
    ["b_fort_native", "b_documents_heavy", "b_video_checkout"].map(
      (counter) => {
        const all = expanded.filter(
          (r) =>
            r.counter === counter &&
            JSON.stringify(r.condition) === JSON.stringify(condition),
        );
        const choices = pairs.map((pair) => {
          const rows = all.filter(
            (r) => r.counterAdmin.join("/") === pair.join("/"),
          );
          return {
            pair,
            wins: rows.filter((r) => r.winner === "counter").length,
            draws: rows.filter((r) => r.winner === "draw").length,
            minMargin: Math.min(...rows.map((r) => r.margin)),
            meanMargin: rows.reduce((s, r) => s + r.margin, 0) / rows.length,
            worst: rows.reduce((a, b) => (a.margin < b.margin ? a : b)),
          };
        });
        return {
          counter,
          condition,
          anyPairBeatsAll: choices.some((r) => r.wins === pairs.length),
          bestCoverage: [...choices].sort(
            (a, b) =>
              b.wins - a.wins || b.draws - a.draws || b.minMargin - a.minMargin,
          )[0],
          bestWorstMargin: [...choices].sort(
            (a, b) => b.minMargin - a.minMargin || b.wins - a.wins,
          )[0],
          choices,
        };
      },
    ),
  );
  // Reverse every fixed-target case and each chosen representative worst matchup.
  const checked = [
    ...fixed,
    ...robust.flatMap((r) => [r.bestCoverage.worst, r.bestWorstMargin.worst]),
  ];
  const mismatches = checked.flatMap((r) => {
    const rev = runAdminDuel(
      r.counter,
      r.counterAdmin,
      r.cartAdmin,
      r.condition,
      true,
    );
    return r.winner !== rev.winner ||
      Math.abs(r.margin - rev.margin) > 1e-8 ||
      r.time !== rev.time
      ? [{ forward: r, reverse: rev }]
      : [];
  });
  return {
    note: "All36 distinct two-admin choices are legal slot configurations, not evidence of obtaining those exact loot offers. BaseHP440 becomes550 with server; server changes HP, not CPU. Capacities26 and35 are reachable with current+5/+9 plans; their acquisition cost is separate. Fused variants use the real public fusion transaction and retain ingredient value. Both counter and Cart can optimize admin choices. No source stat or default loadout changes.",
    pairs,
    conditions,
    fixedSummary,
    robust,
    duels: fixed.length + expanded.length + checked.length,
    seatChecked: checked.length,
    seatMismatches: mismatches,
    fixed,
    expanded,
  };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  console.log(JSON.stringify(runAdminStudy(), null, 2));
