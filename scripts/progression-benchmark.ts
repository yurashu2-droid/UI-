/** Deterministic, deliberately simple acquisition policies, not an optimal-play claim. */
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import D from "../src/data.js";
import E from "../src/engine.js";
import type { ExperimentalRules } from "../src/experimental-combat.js";
import type { Item } from "../src/types.js";
import R from "../src/run.js";
import C from "../src/document.js";
import {
  BATTLE_RULES_VERSION,
  type CombatRulesVersion,
} from "../src/combat-rules.js";
export type Policy = "pressure" | "economy" | "guard" | "navigation";
export interface PathOptions {
  candidateOffer?: boolean;
  candidatePart?:
    "gov_rate_limit" | "gov_pdf" | "go_history" | "gov_notice" | "am_wish";
  experimentalRules?: ExperimentalRules;
  combatVersion?: CombatRulesVersion;
}
/** Synchronous benchmark seam: every transaction and settlement still uses the real engine.
 * The canonical factory is restored even on failure; production entry points never select variants. */
export function simulatePath(
  seed: number,
  policy: Policy,
  options: PathOptions = {},
) {
  if (!options.experimentalRules && !options.combatVersion)
    return simulatePathWithCurrentEngine(seed, policy, options);
  const Canonical = E.Battle;
  E.Battle = class extends Canonical {
    constructor(...args: ConstructorParameters<typeof Canonical>) {
      super(args[0], args[1], {
        ...args[2],
        experimentalRules: options.experimentalRules,
        combatVersion: options.combatVersion,
      });
    }
  };
  try {
    return simulatePathWithCurrentEngine(seed, policy, options);
  } finally {
    E.Battle = Canonical;
  }
}
function simulatePathWithCurrentEngine(
  seed: number,
  policy: Policy,
  options: PathOptions,
) {
  const candidatePart = options.candidatePart ?? "gov_rate_limit";
  const run = R.newRun("campaign", "mixed");
  run.seed = seed;
  run.shop = R.market(run);
  let purchases = 0,
    serverSpend = 0,
    rerollCost = 0,
    rewards = 0,
    economicSpend = 0,
    incomeReturned = 0;
  let firstCumulativeBreakEven: number | null = null,
    blocked: string | null = null;
  const rounds: {
    round: number;
    legal: boolean;
    adminSlots: number;
    load: number;
    capacity: number;
    cashBefore: number;
    cashAfter: number;
    winner: string;
    time: number;
    payoutIncome: number;
    rawIncome: number;
    hp: number;
    choices: string[];
    forgoneLoot: string[];
    held: number;
    offeredCandidate: boolean;
    forgoneOffer: string | null;
    board: Item[];
    admin: string[];
    baseHp: number;
  }[] = [];
  const score = (type: string) => {
    if (policy === "navigation")
      return ["ab_link", "ab_nav"].includes(type) ? 100 : -100;
    if (type.startsWith("admin:")) return 4;
    const d = D.PARTS[type];
    if (!d) return -100;
    if (
      policy === "guard" &&
      type === candidatePart &&
      !run.owned.some((p) => p.type === type)
    )
      return 20;
    const hasAttack = run.owned.some(
      (p) => C.placed(p) && D.PARTS[p.type].kind === "attack",
    );
    if (!hasAttack) return d.kind === "attack" ? 100 - d.price : -100;
    return (
      (policy === "economy"
        ? d.tags.includes("economy")
          ? 8
          : d.kind === "attack"
            ? 5
            : 3
        : d.kind === "attack"
          ? 8
          : d.kind === "shield" || d.kind === "heal"
            ? 5
            : 2) -
      d.price * 0.1
    );
  };
  const place = () => {
    for (const item of run.owned.filter((p) => !C.placed(p))) {
      const d = D.PARTS[item.type];
      item.w = d.minW;
      item.h = d.minH;
      const spot = C.findSpace(run.owned, item);
      if (spot) R.move(run, item.id, spot.x, spot.y);
    }
  };
  for (let guard = 0; guard < 8 && run.phase === "build"; guard++) {
    const round = run.stage + 1,
      cashBefore = run.cash,
      choices: string[] = [];
    // Hypothetical promotion fixture only: replace a shop choice, never grant a free part.
    // Match the real price tier; production market() remains unchanged and experimental-filtered.
    const offeredCandidate =
      !!options.candidateOffer &&
      run.stage >= Math.max(0, D.PARTS[candidatePart].price - 4) &&
      !run.owned.some((p) => p.type === candidatePart);
    let forgoneOffer: string | null = null;
    if (offeredCandidate) {
      let index = run.shop.length - 1;
      while (index >= 0 && run.shop[index].type.startsWith("plan:")) index--;
      if (index >= 0) {
        forgoneOffer = run.shop[index].type;
        run.shop[index] = { type: candidatePart, sold: false };
      }
    }

    for (
      let attempt = 0;
      attempt < (policy === "navigation" ? 12 : 5);
      attempt++
    ) {
      const available = run.shop
        .filter(
          (s) =>
            !s.sold &&
            !s.type.startsWith("plan:") &&
            D.PARTS[s.type].price <= run.cash,
        )
        .sort(
          (a, b) =>
            score(b.type) - score(a.type) || a.type.localeCompare(b.type),
        );
      const choice = available.find((s) => score(s.type) > -100);
      if (!choice) {
        if (
          (policy === "navigation" ||
            !run.owned.some((p) => D.PARTS[p.type].kind === "attack")) &&
          run.cash >= (policy === "navigation" ? 7 : 4)
        ) {
          const before = run.cash;
          if (R.reroll(run).ok) {
            rerollCost += before - run.cash;
            choices.push("reroll");
            continue;
          }
        }
        break;
      }
      const before = run.cash;
      if (!R.purchase(run, choice.type).ok) break;
      const cost = before - run.cash;
      purchases += cost;
      if (D.PARTS[choice.type].tags.includes("economy")) economicSpend += cost;
      choices.push(choice.type);
      place();
      if (policy !== "navigation" && attempt >= 1) break;
    }
    const info = C.analyze(run.owned);
    if (info.load > R.capacity(run)) {
      const plan = run.shop.find((s) => !s.sold && s.type.startsWith("plan:"));
      if (plan) {
        const before = run.cash;
        if (R.purchase(run, plan.type).ok) {
          purchases += before - run.cash;
          serverSpend += before - run.cash;
          choices.push(plan.type);
        }
      }
    }
    place();
    const load = C.analyze(run.owned).load,
      cap = R.capacity(run),
      slots = R.adminSlots(run);
    const legal = run.owned
      .filter(C.placed)
      .every((p) => C.canPlace(run.owned, p, p.x, p.y, p.w, p.h));
    const snapshot = run.owned.map((p) => ({ ...p })),
      admin = [...(run.admin ?? [])],
      baseHp = 180 + run.stage * 40;
    const started = R.startBattle(run);
    if (!started.ok || !("battle" in started)) {
      blocked = started.ok ? "No battle" : started.error;
      break;
    }
    const b = started.battle;
    while (!b.result) b.step(0.05);
    const settled = R.settleBattle(run, b);
    if (!settled.ok || !("summary" in settled))
      throw Error("Probe settlement failed");
    const s = settled.summary;
    rewards += s.total;
    incomeReturned += s.income;
    if (
      firstCumulativeBreakEven === null &&
      economicSpend > 0 &&
      incomeReturned >= economicSpend
    )
      firstCumulativeBreakEven = round;
    let forgoneLoot: string[] = [];
    if (run.pending) {
      const candidates = [...run.pending.loot].sort(
        (a, b) => score(b) - score(a) || a.localeCompare(b),
      );
      const chosen = candidates[0] ?? null;
      forgoneLoot = candidates.filter((x) => x !== chosen);
      const claimed = R.claimLoot(run, chosen);
      if (!claimed.ok) throw Error("Probe reward failed");
      choices.push("loot:" + chosen);
    }
    rounds.push({
      round,
      legal,
      adminSlots: slots,
      load,
      capacity: cap,
      cashBefore,
      cashAfter: run.cash,
      winner: s.winner,
      time: s.time,
      payoutIncome: s.income,
      rawIncome: s.rawIncome,
      hp: s.hp,
      choices,
      forgoneLoot,
      held: run.owned.filter((p) => !C.placed(p)).length,
      offeredCandidate,
      forgoneOffer,
      board: snapshot,
      admin,
      baseHp,
    });
  }
  return {
    rulesVersion: options.combatVersion ?? BATTLE_RULES_VERSION,
    experimentalRules: options.experimentalRules ?? null,
    seed,
    policy,
    experimentalOffer: !!options.candidateOffer,
    candidatePart,
    fusionPolicy: "defer; no automatic fusion",
    cash: run.cash,
    lives: run.lives,
    wins: run.wins,
    phase: run.phase,
    purchases,
    serverSpend,
    rerollCost,
    rewards,
    economicSpend,
    incomeReturned,
    firstCumulativeBreakEven,
    blocked,
    rounds,
  };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const rows = [101, 102, 103, 104, 105].flatMap((seed) =>
    (["pressure", "economy"] as const).map((policy) =>
      simulatePath(seed, policy),
    ),
  );
  console.log(
    JSON.stringify(
      {
        note: "Paired fixed-seed heuristic paths, not a representative win rate or proof of optimal play",
        rows,
      },
      null,
      2,
    ),
  );
}
