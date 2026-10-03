/** Reversible component ablations; do not change shipped fusion or administration rules. */
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { BUILDS } from "../src/builds.js";
import { board, fusedEntrant, resources } from "../src/buildlab.js";
import { adminPairs } from "./admin-balance-benchmark.js";
import {
  OneClickAblationBattle,
  type OneClickDials,
} from "./experiments/oneclick-ablation.js";
const variants: { id: string; dials: OneClickDials }[] = [
  { id: "canonical", dials: {} },
  { id: "conversion15", dials: { conversion15: true } },
  { id: "natural9", dials: { naturalBase9: true } },
  { id: "period3", dials: { period3: true } },
  { id: "input-load", dials: { restoreInputLoad: true } },
  { id: "natural9-period3", dials: { naturalBase9: true, period3: true } },
  {
    id: "all-input-numbers",
    dials: {
      conversion15: true,
      naturalBase9: true,
      period3: true,
      restoreInputLoad: true,
    },
  },
];
const entry = (id: string) =>
  fusedEntrant({ ...BUILDS.find((b) => b.id === id)!, build: true }).entrant;
const cart = entry("b_cart"),
  counters = ["b_fort_native", "b_documents_heavy", "b_video_checkout"].map(
    entry,
  );
function fight(
  counter: typeof cart,
  pair: string[],
  cartPair: string[],
  capacity: number,
  dials: OneClickDials,
  reverse: boolean,
) {
  const a = board(counter.layout, "a"),
    b = board(cart.layout, "b");
  const battle = new OneClickAblationBattle(
    reverse ? b : a,
    reverse ? a : b,
    {
      playerHp: 440,
      enemyHp: 440,
      playerCapacity: capacity,
      enemyCapacity: capacity,
      playerAdmin: reverse ? cartPair : pair,
      enemyAdmin: reverse ? pair : cartPair,
    },
    dials,
  );
  while (!battle.result) battle.step(0.05);
  const own = reverse ? battle.enemy : battle.player,
    foe = reverse ? battle.player : battle.enemy;
  return {
    winner:
      battle.result.winner === "draw"
        ? "draw"
        : battle.result.winner === own.name
          ? "counter"
          : "cart",
    time: battle.elapsed,
    hpCounter: own.hp / own.maxHp,
    hpCart: foe.hp / foe.maxHp,
    margin: own.hp / own.maxHp - foe.hp / foe.maxHp,
    loadCart: foe.load,
    lagCart: foe.lag,
  };
}
export function runOneClickCausality() {
  const rows = variants.flatMap((variant) =>
    [26, 35].flatMap((capacity) =>
      [
        ["server", "backup"],
        ["cdn", "backup"],
      ].flatMap((cartAdmin) =>
        counters.flatMap((counter) =>
          adminPairs().map((counterAdmin) => {
            const result = fight(
                counter,
                counterAdmin,
                cartAdmin,
                capacity,
                variant.dials,
                false,
              ),
              reverse = fight(
                counter,
                counterAdmin,
                cartAdmin,
                capacity,
                variant.dials,
                true,
              );
            return {
              variant: variant.id,
              capacity,
              cartAdmin,
              counter: counter.id,
              counterAdmin,
              ...result,
              seatConsistent:
                result.winner === reverse.winner &&
                Math.abs(result.margin - reverse.margin) < 1e-8 &&
                result.time === reverse.time,
            };
          }),
        ),
      ),
    ),
  );
  const summary = variants.flatMap((v) =>
    [26, 35].map((capacity) => {
      const r = rows.filter(
        (r) => r.variant === v.id && r.capacity === capacity,
      );
      return {
        variant: v.id,
        capacity,
        pairs: r.length,
        counterWins: r.filter((r) => r.winner === "counter").length,
        draws: r.filter((r) => r.winner === "draw").length,
        cartWins: r.filter((r) => r.winner === "cart").length,
        bestCounter: r.reduce((a, b) => (a.margin > b.margin ? a : b)),
      };
    }),
  );
  return {
    note: "Causal probes only. Both layouts accept real fusion and retain recipe input value. All36 counter administrator pairs face the two independently verified strong Cart pairs. BaseHP440, reachableCPU26/35. Individual effects are removed without changing unrelated parts. Restoring all input numbers is not exactly the unfused topology: fused geometry and routing remain.",
    variants,
    resources: {
      cart: resources(cart.layout),
      counters: counters.map((c) => ({ id: c.id, ...resources(c.layout) })),
    },
    orderedMatches: rows.length * 2,
    seatMismatches: rows.filter((r) => !r.seatConsistent).length,
    summary,
    rows,
  };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  console.log(JSON.stringify(runOneClickCausality(), null, 2));
