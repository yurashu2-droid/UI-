/** Actual experimental definition comparison; no catalogue promotion or ordinary market change. */
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
import { simulatePath } from "./progression-benchmark.js";
type Defense = "go_history" | "gov_notice" | "am_wish";
function entry(id: string): Entrant {
  if (id === "b_cart-fused") return fusedEntrant(entry("b_cart")).entrant;
  if (id === "trial-ad-converter") {
    const b = entry("b_documents_heavy");
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
  const b = BUILDS.find((b) => b.id === id);
  if (!b) throw Error("Unknown example");
  return {
    ...b,
    build: true,
    layout: b.layout.filter((r) => D.PARTS[r[0]].status !== "experimental"),
  };
}
export function runHistoryCase(
  defender: string,
  opponent: string,
  defense: Defense,
  hp = 440,
  phaseDelay = 0,
) {
  const a = entry(defender),
    b = entry(opponent);
  const y = (
    {
      b_fort_native: 404,
      b_documents_heavy: 568,
      b_video_checkout: 444,
      b_cart: 536,
      "trial-ad-converter": 568,
    } as Record<string, number>
  )[defender];
  a.layout = [...a.layout, [defense, 24, y, 280, 112]];
  const r = resources(a.layout);
  assert.equal(r.legal, true);
  let initialRemaining = 0,
    period = 0;
  const fight = (reverse: boolean) => {
    const ab = board(a.layout, "a"),
      bb = board(b.layout, "b"),
      slot = ab.at(-1)!.id;
    const battle = new E.Battle(reverse ? bb : ab, reverse ? ab : bb, {
      playerHp: hp,
      enemyHp: hp,
      playerCapacity: 35,
      enemyCapacity: 35,
      playerAdmin: [],
      enemyAdmin: [],
    });
    const side = reverse ? battle.enemy : battle.player,
      foe = reverse ? battle.player : battle.enemy;
    const p = side.parts.find((p) => p.id === slot)!;
    period = p.period;
    initialRemaining = p.remaining;
    p.remaining += phaseDelay;
    let restores = 0,
      records = 0,
      clears = 0;
    while (!battle.result) {
      for (const event of battle.step(0.05))
        if (event.kind === "history" && event.side === side.name) {
          if (event.action === "restore") restores++;
          if (event.action === "record") records++;
          if (event.action === "clear") clears++;
        }
    }
    return {
      winner:
        battle.result.winner === "draw"
          ? "draw"
          : battle.result.winner === side.name
            ? "defender"
            : "opponent",
      time: battle.elapsed,
      hp: side.hp / side.maxHp,
      opponentHp: foe.hp / foe.maxHp,
      healing: p.healed,
      fires: p.fires,
      income: side.income,
      conversionSpent: battle.metrics[side.name].spent,
      restores,
      records,
      clears,
    };
  };
  const forward = fight(false),
    reverse = fight(true);
  return {
    defender,
    opponent,
    defense,
    baseHp: hp,
    phaseDelay,
    resources: r,
    slot: {
      cost: D.PARTS[defense].price,
      load: D.PARTS[defense].load,
      unspentFrom6: 6 - D.PARTS[defense].price,
      period,
      initialRemaining,
    },
    ...forward,
    reverse,
    seatConsistent:
      forward.winner === reverse.winner &&
      Math.abs(forward.hp - reverse.hp) < 1e-8 &&
      Math.abs(forward.healing - reverse.healing) < 1e-8,
  };
}
export function runHistoryTrial(seeds = 50) {
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
  const cases = defenders.flatMap((d) =>
    opponents.flatMap((o) =>
      [440, 1200].flatMap((hp) =>
        [0, 0.75, 1.5].map((phaseDelay) => {
          const history = runHistoryCase(d, o, "go_history", hp, phaseDelay),
            notice = runHistoryCase(d, o, "gov_notice", hp, phaseDelay),
            wish = runHistoryCase(d, o, "am_wish", hp, phaseDelay);
          return {
            history,
            notice,
            wish,
            healingVsNotice: history.healing - notice.healing,
            hpVsNotice: history.hp - notice.hp,
            timeVsNotice: history.time - notice.time,
          };
        }),
      ),
    ),
  );
  const economy = opponents.flatMap((o) =>
    [440, 1200].map((hp) => ({
      history: runHistoryCase("trial-ad-converter", o, "go_history", hp),
      notice: runHistoryCase("trial-ad-converter", o, "gov_notice", hp),
      wish: runHistoryCase("trial-ad-converter", o, "am_wish", hp),
    })),
  );
  const paid = Array.from({ length: seeds }, (_, i) => {
    const seed = 101 + i;
    return {
      seed,
      history: simulatePath(seed, "guard", {
        candidateOffer: true,
        candidatePart: "go_history",
      }),
      notice: simulatePath(seed, "guard", {
        candidateOffer: true,
        candidatePart: "gov_notice",
      }),
      wish: simulatePath(seed, "guard", {
        candidateOffer: true,
        candidatePart: "am_wish",
      }),
    };
  });
  const paidSummary = (["history", "notice", "wish"] as const).map((key) => {
    const rows = paid.map((r) => r[key]);
    return {
      kind: key,
      paths: rows.length,
      wins: rows.reduce((s, r) => s + r.wins, 0),
      round8: rows.filter((r) => r.rounds.some((s) => s.round === 8)).length,
      purchases: rows.reduce((s, r) => s + r.purchases, 0),
      rerollSpend: rows.reduce((s, r) => s + r.rerollCost, 0),
      blocked: rows.filter((r) => r.blocked).length,
      acquired: rows.filter((r) =>
        r.rounds.some((s) =>
          s.board.some(
            (p) =>
              p.type ===
              { history: "go_history", notice: "gov_notice", wish: "am_wish" }[
                key
              ],
          ),
        ),
      ).length,
    };
  });
  return {
    note: "Actual go_history family/tags/timing, candidate remains experimental. Common defense allowance$6: history spends6/CPU2, notice and wish spend5/CPU2 and retain$1; no free compensation. Paid routes are EXPLICIT HYPOTHETICAL OFFER trials, replacing a real shop slot after the price tier unlocks. They pay the actual catalogue price through R.purchase but do not prove current live availability. Baseline family timing is intentionally native, not forced equal.",
    orderedMatches: (cases.length + economy.length) * 6,
    seatMismatches: [...cases, ...economy]
      .flatMap((r) => [r.history, r.notice, r.wish])
      .filter((r) => !r.seatConsistent).length,
    cases,
    economy,
    paidSummary,
    paid,
  };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  console.log(JSON.stringify(runHistoryTrial(), null, 2));
