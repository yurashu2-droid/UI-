/** Paid composition pursuit through the actual eight-round campaign. No shop injection or free parts. */
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import D from "../src/data.js";
import C from "../src/document.js";
import E from "../src/engine.js";
import R from "../src/run.js";
import { BUILDS } from "../src/builds.js";
import {
  nativeFortressCandidate,
  heavyDocumentCandidate,
} from "../src/balance-candidates.js";
import { BATTLE_RULES_VERSION } from "../src/combat-rules.js";
import { RECIPES } from "../src/fusion.js";
import type { Item, LayoutEntry, Run } from "../src/types.js";
import type { Entrant } from "../src/buildlab.js";
import {
  arrangeComposition,
  compositionProgress,
  validateCompositionTarget,
} from "./paid-composition.js";
export type TargetPolicy =
  | "cart"
  | "cart-fused"
  | "fortress"
  | "documents"
  | "onestop"
  | "native-links"
  | "oneclick-battery";
const base = (id: string): Entrant => ({
  ...BUILDS.find((b) => b.id === id)!,
  build: true,
});
export const targetFor = (policy: TargetPolicy): Entrant =>
  policy === "native-links"
    ? {
        id: "paid_native_links",
        name: "リンク防御の購入目標",
        build: true,
        admin: [],
        layout: [
          ...[16, 320, 624].flatMap((x) => [
            ...[24, 100].flatMap((y) =>
              [0, 96].map(
                (dx) => ["ab_link", x + dx, y, 96, 24] as LayoutEntry,
              ),
            ),
            ["gov_font", x, 56, 208, 36] as LayoutEntry,
            ...[132, 148].map((y) => ["ab_hr", x, y, 192, 8] as LayoutEntry),
          ]),
          ["ab_guestbook", 24, 216, 320, 132],
        ],
      }
    : policy === "oneclick-battery"
      ? {
          id: "paid_oneclick_battery",
          name: "複数購入欄の購入目標",
          build: true,
          admin: [],
          layout: [
            ["am_product", 24, 24, 704, 300],
            ["am_quantity", 24, 324, 80, 40],
            ...Array.from({ length: 4 }, (_, i): LayoutEntry => [
              "am_oneclick",
              104 + 128 * i,
              324,
              128,
              40,
            ]),
            ["am_prime", 616, 324, 112, 40],
            ["am_rating", 736, 324, 200, 32],
            ["ab_counter", 24, 372, 704, 26],
          ],
        }
      : policy === "onestop"
        ? {
            id: "paid_onestop",
            name: "ワンストップ申請の購入目標",
            build: true,
            admin: [],
            layout: [
              ["gov_form", 16, 16, 920, 300],
              ["gov_breadcrumb", 32, 72, 560, 28],
              ...Array.from({ length: 6 }, (_, i): LayoutEntry => [
                "gov_onestop",
                32 + 136 * i,
                108,
                136,
                40,
              ]),
              ["gov_font", 32, 156, 232, 36],
              ["go_suggest", 272, 156, 420, 84],
            ],
          }
        : policy.startsWith("cart")
          ? base("b_cart")
          : policy === "fortress"
            ? nativeFortressCandidate(base("b_fort"))
            : heavyDocumentCandidate(base("b_echo"));
const clone = <T>(v: T): T => structuredClone(v);
function counts(items: Item[]) {
  const out: Record<string, number> = {};
  const add = (type: string) => {
    const recipe = RECIPES.find((r) => r.into === type);
    if (recipe) {
      add(recipe.a);
      add(recipe.b);
    } else out[type] = (out[type] ?? 0) + 1;
  };
  for (const p of items) add(p.type);
  return out;
}
function arrange(run: Run, target: Entrant, fuse: boolean) {
  for (const p of run.owned) assert.equal(R.move(run, p.id, null, null), true);
  const unused = new Set(run.owned.map((p) => p.id));
  if (target.id === "paid_oneclick_battery") {
    const place = (
      type: string,
      x: number,
      y: number,
      w: number,
      h: number,
    ) => {
      const p = run.owned.find((p) => unused.has(p.id) && p.type === type);
      if (!p) return;
      assert.equal(
        R.move(run, p.id, x, y, w, h),
        true,
        "purchase assembly: " + type,
      );
      unused.delete(p.id);
    };
    for (const [type, x, y, w, h] of target.layout) place(type, x!, y!, w!, h!);
    for (let i = 0; i < 4; i++) {
      const x = 24 + 232 * i;
      place("am_cart", x, 408, 200, 100);
      place("am_buy", x, 516, 128, 40);
    }
    for (const p of run.owned.filter((p) => unused.has(p.id))) {
      const d = D.PARTS[p.type],
        spot = C.findSpace(run.owned, { ...p, w: d.minW, h: d.minH });
      if (spot)
        assert.equal(R.move(run, p.id, spot.x, spot.y, d.minW, d.minH), true);
    }
    return;
  }
  if (target.id === "paid_onestop") {
    const place = (
      type: string,
      x: number,
      y: number,
      w: number,
      h: number,
    ) => {
      const p = run.owned.find((p) => unused.has(p.id) && p.type === type);
      if (!p) return;
      assert.equal(
        R.move(run, p.id, x, y, w, h),
        true,
        "onestop assembly: " + type,
      );
      unused.delete(p.id);
    };
    const donors = run.owned.some((p) =>
      ["gov_check", "gov_submit"].includes(p.type),
    );
    place("gov_form", 16, 16, 920, donors ? 500 : 300);
    place("gov_breadcrumb", 32, 72, 560, 28);
    for (let i = 0; i < 6; i++)
      place("gov_onestop", 32 + 136 * i, 108, 136, 40);
    place("gov_font", 32, 156, 232, 36);
    place("go_suggest", 272, 156, 420, 84);
    for (let i = 0; i < 6; i++) {
      const x = 32 + 296 * (i % 3),
        y = 264 + 152 * Math.floor(i / 3);
      place("gov_check", x, y, 232, 32);
      place("gov_submit", x, y + 40, 184, 40);
    }
    for (const p of run.owned.filter((p) => unused.has(p.id))) {
      const d = D.PARTS[p.type],
        spot = C.findSpace(run.owned, { ...p, w: d.minW, h: d.minH });
      if (spot)
        assert.equal(R.move(run, p.id, spot.x, spot.y, d.minW, d.minH), true);
    }
    return;
  }
  const assembling =
    fuse &&
    run.owned.some((p) => p.type === "am_buy") &&
    run.owned.some((p) => p.type === "am_cart");
  let firstCart = true;
  for (const original of target.layout) {
    let row = original;
    if (assembling && row[0] === "am_buy") row = ["am_buy", 24, 536, 168, 40];
    if (assembling && row[0] === "am_cart" && firstCart) {
      row = ["am_cart", 24, 576, 240, 100];
      firstCart = false;
    }
    const p = run.owned.find((p) => unused.has(p.id) && p.type === row[0]);
    if (!p) continue;
    assert.equal(
      R.move(run, p.id, row[1], row[2], row[3], row[4]),
      true,
      "target geometry: " + p.type,
    );
    unused.delete(p.id);
  }
  // 1-Click occupies the purchased buy button's old role; consumed cart space becomes free.
  for (const p of run.owned.filter(
    (p) => unused.has(p.id) && p.type === "am_oneclick",
  )) {
    const row = target.layout.find((r) => r[0] === "am_buy");
    if (row && R.move(run, p.id, row[1], row[2], row[3], row[4]))
      unused.delete(p.id);
  }
  for (const p of run.owned.filter((p) => unused.has(p.id))) {
    const d = D.PARTS[p.type];
    const w = d.minW,
      h = d.minH;
    const probe = { ...p, w, h };
    const spot = C.findSpace(run.owned, probe);
    if (spot) assert.equal(R.move(run, p.id, spot.x, spot.y, w, h), true);
  }
}
export function simulateTargetPath(
  seed: number,
  policy: TargetPolicy,
  options: { preferredAdmins?: string[]; composition?: Entrant } = {},
) {
  const composition = options.composition
    ? validateCompositionTarget(options.composition)
    : undefined;
  const run = R.newRun("campaign");
  run.seed = seed;
  run.shop = R.market(run);
  const target = composition ?? targetFor(policy),
    demand = counts(
      target.layout.map((r, i) =>
        C.makeItem(r[0], "goal" + i, r[1], r[2], r[3], r[4]),
      ),
    );
  const transactions: {
    kind: string;
    round: number;
    type: string;
    cost: number;
    cash: number;
    offered: string[];
    from?: string[];
    inputIds?: string[];
    outputId?: string;
  }[] = [];
  const rounds: {
    round: number;
    winner: string;
    time: number;
    legal: boolean;
    capacity: number;
    load: number;
    baseHp: number;
    admin: string[];
    board: Item[];
    cash: number;
    targetFilled: number;
    targetTotal: number;
    missing: { type: string; count: number }[];
    held: number;
    outputsTotal: number;
    outputsOwned: number;
    outputsPlaced: number;
    targetLayoutComplete: boolean;
  }[] = [];
  let partSpend = 0,
    serverSpend = 0,
    rerollSpend = 0,
    rewards = 0,
    blocked: string | null = null;
  const score = (type: string) => {
    if (type.startsWith("admin:"))
      return options.preferredAdmins
        ? options.preferredAdmins.includes(type.slice(6))
          ? 120
          : -100
        : 25;
    const d = D.PARTS[type];
    if (!d) return -1000;
    const owned = counts(run.owned),
      attacks = run.owned.filter(
        (p) => D.PARTS[p.type].kind === "attack",
      ).length;
    if ((owned[type] ?? 0) < (demand[type] ?? 0)) {
      if (d.kind === "attack") return 100 - (owned[type] ?? 0) * 2;
      if (
        !options.composition &&
        ["gov_font", "go_suggest", "ab_table", "gov_form"].includes(type) &&
        !(policy === "onestop"
          ? (owned.gov_submit ?? 0)
          : policy === "native-links"
            ? (owned.ab_link ?? 0)
            : (owned.gov_pdf ?? 0))
      )
        return -100;
      return attacks ? 70 - (owned[type] ?? 0) * 2 : -100;
    }
    // Modest paid bridge until the target culture unlocks; not a replacement inventory grant.
    if (
      ["ab_link", "ab_nav"].includes(type) &&
      (owned.ab_link ?? 0) + (owned.ab_nav ?? 0) < 4
    )
      return 50;
    if (type === "ab_heading" && !owned[type]) return 40;
    if (type === "ab_guestbook" && !owned[type]) return 35;
    return -100;
  };
  const buy = (type: string) => {
    const offered = run.shop.filter((s) => !s.sold).map((s) => s.type),
      before = run.cash;
    const result = R.purchase(run, type);
    if (!result.ok) return false;
    const cost = before - run.cash;
    if (type.startsWith("plan:")) serverSpend += cost;
    else partSpend += cost;
    transactions.push({
      kind: "buy",
      round: run.stage + 1,
      type,
      cost,
      cash: run.cash,
      offered,
    });
    return true;
  };
  for (let guard = 0; guard < 8 && run.phase === "build"; guard++) {
    let rolls = 0;
    for (let action = 0; action < 12; action++) {
      const offer = run.shop
        .filter(
          (s) =>
            !s.sold &&
            D.PARTS[s.type] &&
            D.PARTS[s.type].price <= run.cash &&
            score(s.type) > 0,
        )
        .sort(
          (a, b) =>
            score(b.type) - score(a.type) || a.type.localeCompare(b.type),
        )[0];
      if (offer) {
        assert.equal(buy(offer.type), true);
        continue;
      }
      // At most three paid rerolls each stage. Keep enough for an eventual high-price input.
      if (rolls < 3 && run.cash >= 8) {
        const before = run.cash;
        assert.equal(R.reroll(run).ok, true);
        rolls++;
        const cost = before - run.cash;
        rerollSpend += cost;
        transactions.push({
          kind: "reroll",
          round: run.stage + 1,
          type: "reroll",
          cost,
          cash: run.cash,
          offered: run.shop.map((s) => s.type),
        });
        continue;
      }
      break;
    }
    const compositionPairs = options.composition
      ? arrangeComposition(run, target)
      : [];
    if (!options.composition) arrange(run, target, policy === "cart-fused");
    if (C.analyze(run.owned).load > R.capacity(run)) {
      const plan = run.shop.find((s) => !s.sold && s.type.startsWith("plan:"));
      if (plan) buy(plan.type);
    }
    const info = E.analyze(run.owned),
      available = counts(run.owned);
    const missing = Object.entries(demand)
      .map(([type, n]) => ({
        type,
        count: Math.max(0, n - (available[type] ?? 0)),
      }))
      .filter((m) => m.count > 0);
    const targetTotal = Object.values(demand).reduce((a, b) => a + b, 0);
    const state = {
      round: run.stage + 1,
      legal: run.owned
        .filter(C.placed)
        .every((p) => C.canPlace(run.owned, p, p.x, p.y, p.w, p.h)),
      capacity: R.capacity(run),
      load: info.load,
      baseHp: 180 + run.stage * 40,
      admin: [...(run.admin ?? [])],
      board: clone(run.owned),
      cash: run.cash,
      targetFilled: targetTotal - missing.reduce((s, m) => s + m.count, 0),
      targetTotal,
      missing,
      held: run.owned.filter((p) => !C.placed(p)).length,
      ...compositionProgress(run.owned, target),
    };
    assert.equal(state.legal, true);
    const started = R.startBattle(run);
    if (!started.ok || !("battle" in started)) {
      blocked = started.ok ? "Missing battle" : started.error;
      break;
    }
    const battle = started.battle;
    while (!battle.result) battle.step(0.05);
    const settled = R.settleBattle(run, battle);
    assert.equal(settled.ok, true);
    if (!settled.ok || !("summary" in settled))
      throw Error("Missing settlement");
    rewards += settled.summary.total;
    rounds.push({
      ...state,
      winner: settled.summary.winner,
      time: settled.summary.time,
    });
    if (options.composition && (run.phase as string) !== "gameover") {
      for (const pair of compositionPairs)
        for (const f of R.fuse(run, { pair }))
          transactions.push({
            kind: "fusion",
            round: state.round,
            type: f.recipe.into,
            cost: 0,
            cash: run.cash,
            offered: [],
            from: f.from,
            inputIds: [...pair],
            outputId: f.item.id,
          });
    }
    if (
      !options.composition &&
      ["cart-fused", "onestop", "oneclick-battery"].includes(policy) &&
      (run.phase as string) !== "gameover"
    ) {
      // Use only the real adjacent purchase+cart recipe, after paying and surviving that battle.
      for (const p of run.owned)
        p.fusionLocked = !(
          policy === "onestop"
            ? ["gov_check", "gov_submit"]
            : ["am_buy", "am_cart"]
        ).includes(p.type);
      for (const f of R.fuse(run))
        transactions.push({
          kind: "fusion",
          round: state.round,
          type: f.recipe.into,
          cost: 0,
          cash: run.cash,
          offered: [],
          from: f.from,
        });
    }
    if (run.pending) {
      const offered = [...run.pending.loot];
      const chosen =
        offered
          .filter((t) => score(t) > 0)
          .sort((a, b) => score(b) - score(a) || a.localeCompare(b))[0] ?? null;
      assert.equal(R.claimLoot(run, chosen).ok, true);
      if (chosen)
        transactions.push({
          kind: "loot",
          round: state.round,
          type: chosen,
          cost: 0,
          cash: run.cash,
          offered,
        });
    }
  }
  assert.equal(run.cash, 10 + rewards - partSpend - serverSpend - rerollSpend);
  return {
    rulesVersion: BATTLE_RULES_VERSION,
    preferredAdmins: options.preferredAdmins ?? null,
    seed,
    policy,
    ...(options.composition
      ? { target: clone(target), pursuit: "composition" as const }
      : {}),
    cash: run.cash,
    wins: run.wins,
    lives: run.lives,
    phase: run.phase,
    partSpend,
    serverSpend,
    rerollSpend,
    rewards,
    blocked,
    transactions,
    rounds,
  };
}
/** Any legal production composition can be pursued; the original policy cohorts stay unchanged. */
export function simulateCompositionPath(
  seed: number,
  target: Entrant,
  options: { preferredAdmins?: string[] } = {},
) {
  return {
    ...simulateTargetPath(seed, "documents", {
      ...options,
      composition: target,
    }),
    policy: "composition" as const,
    target: validateCompositionTarget(target),
  };
}
export function comparePaidTargets(firstSeed = 101, seeds = 30) {
  const policies: TargetPolicy[] = [
    "cart",
    "cart-fused",
    "fortress",
    "documents",
  ];
  const rows = Array.from({ length: seeds }, (_, i) =>
    policies.map((p) => simulateTargetPath(firstSeed + i, p)),
  ).flat();
  const summary = policies.map((policy) => {
    const group = rows.filter((r) => r.policy === policy);
    return {
      policy,
      paths: group.length,
      wins: group.reduce((s, r) => s + r.wins, 0),
      round8: group.filter((r) => r.rounds.some((s) => s.round === 8)).length,
      completeTarget: group.filter((r) =>
        r.rounds.some((s) => s.targetFilled === s.targetTotal),
      ).length,
      meanFinalCompletion:
        group.reduce(
          (s, r) =>
            s +
            (r.rounds.at(-1)?.targetFilled ?? 0) /
              (r.rounds.at(-1)?.targetTotal ?? 1),
          0,
        ) / group.length,
      partSpend: group.reduce((s, r) => s + r.partSpend, 0),
      serverSpend: group.reduce((s, r) => s + r.serverSpend, 0),
      rerollSpend: group.reduce((s, r) => s + r.rerollSpend, 0),
      fusions: group
        .flatMap((r) => r.transactions)
        .filter((t) => t.kind === "fusion").length,
      blocked: group.filter((r) => r.blocked).length,
    };
  });
  return {
    note: "Real market/loot/reroll/fusion transactions. Fixed-seed bounded heuristics, not optimal play or population win rates. Full-target misses are not an impossibility proof.",
    summary,
    rows,
  };
}
/** Counterfactual arena duels from real same-seed, same-round inventories; no settlement is changed. */
export function compareReachedCounters(
  rows: ReturnType<typeof simulateTargetPath>[],
) {
  type Snapshot = ReturnType<typeof simulateTargetPath>["rounds"][number];
  const fight = (a: Snapshot, b: Snapshot) => {
    const battle = new E.Battle(clone(a.board), clone(b.board), {
      playerHp: a.baseHp,
      enemyHp: b.baseHp,
      playerCapacity: a.capacity,
      enemyCapacity: b.capacity,
      playerAdmin: a.admin,
      enemyAdmin: b.admin,
    });
    while (!battle.result) battle.step(0.05);
    return {
      winner: battle.result.winner,
      time: battle.elapsed,
      hpA: battle.player.hp / battle.player.maxHp,
      hpB: battle.enemy.hp / battle.enemy.maxHp,
    };
  };
  const matches: {
    seed: number;
    round: number;
    counter: TargetPolicy;
    target: TargetPolicy;
    hp: number;
    capacityA: number;
    capacityB: number;
    loadA: number;
    loadB: number;
    winner: string;
    time: number;
    hpA: number;
    hpB: number;
    reverseWinner: string;
    seatConsistent: boolean;
    inputsA: number;
    inputsB: number;
    targetHasOneClick: boolean;
  }[] = [];
  for (const a of rows.filter((r) =>
    ["fortress", "documents"].includes(r.policy),
  )) {
    for (const b of rows.filter(
      (r) => r.seed === a.seed && r.policy.startsWith("cart"),
    )) {
      for (const ar of a.rounds.filter((r) => r.round >= 4)) {
        const br = b.rounds.find((r) => r.round === ar.round);
        if (!br) continue;
        const forward = fight(ar, br),
          reverse = fight(br, ar);
        const inverse =
          forward.winner === "draw"
            ? "draw"
            : forward.winner === "player"
              ? "enemy"
              : "player";
        matches.push({
          seed: a.seed,
          round: ar.round,
          counter: a.policy,
          target: b.policy,
          hp: ar.baseHp,
          capacityA: ar.capacity,
          capacityB: br.capacity,
          loadA: ar.load,
          loadB: br.load,
          ...forward,
          reverseWinner: reverse.winner,
          seatConsistent: reverse.winner === inverse,
          inputsA: ar.targetFilled,
          inputsB: br.targetFilled,
          targetHasOneClick: br.board.some(
            (p) => C.placed(p) && p.type === "am_oneclick",
          ),
        });
      }
    }
  }
  const summarize = (selected: typeof matches) =>
    [
      ...new Set(selected.map((m) => [m.counter, m.target, m.round].join("/"))),
    ].map((key) => {
      const group = selected.filter(
        (m) => [m.counter, m.target, m.round].join("/") === key,
      );
      return {
        counter: group[0].counter,
        target: group[0].target,
        round: group[0].round,
        pairs: group.length,
        counterWins: group.filter((m) => m.winner === "player").length,
        cartWins: group.filter((m) => m.winner === "enemy").length,
        draws: group.filter((m) => m.winner === "draw").length,
      };
    });
  const summary = summarize(matches);
  const actualFusedSummary = summarize(
    matches.filter((m) => m.targetHasOneClick),
  );
  return {
    note: "Survivor cohort only: both policies must reach the same round. These matches do not alter paid route rewards. Capacity and admins retain each actual route investment.",
    seatMismatches: matches.filter((m) => !m.seatConsistent).length,
    orderedMatches: matches.length * 2,
    actualFusedSummary,
    summary,
    matches,
  };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const n = Number(
    process.argv.find((a) => a.startsWith("--seeds="))?.split("=")[1] ?? 30,
  );
  const paths = comparePaidTargets(101, n);
  console.log(
    JSON.stringify(
      { ...paths, reachedCounters: compareReachedCounters(paths.rows) },
      null,
      2,
    ),
  );
}
