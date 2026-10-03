/** Causal probes for the sampled repeated-purchase hotspot; never used by production battles. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { board, resources } from "../src/buildlab.js";
import {
  adminChoices,
  runSearch,
  DEFAULT_LIMITS,
  type Candidate,
} from "./open-build-search.js";
import type { Item } from "../src/types.js";
import {
  OneClickAblationBattle,
  type OneClickDials,
} from "./experiments/oneclick-ablation.js";

export const REPEAT_VARIANTS: { id: string; dials: OneClickDials }[] = [
  { id: "canonical", dials: {} },
  { id: "no-natural-damage", dials: { noNaturalDamage: true } },
  { id: "no-conversion-damage", dials: { noConversionDamage: true } },
  { id: "no-income-growth", dials: { noIncomeGrowth: true } },
  { id: "shared-income-growth", dials: { sharedIncomeGrowth: true } },
  { id: "natural-base9", dials: { naturalBase9: true } },
  { id: "period3", dials: { period3: true } },
  { id: "input-load5", dials: { restoreInputLoad: true } },
  ...[0.1, 0.15, 0.2, 0.25, 0.3].map((extraWeight) => ({
    id: `repeat2-${extraWeight}`,
    dials: { repeatCadence: { freeCopies: 2, extraWeight } },
  })),
];
export function repeatDuel(
  a: Candidate,
  b: Candidate,
  hp: number,
  capacity: number,
  dials: OneClickDials,
  reverse = false,
) {
  const battle = new OneClickAblationBattle(
    board(reverse ? b.layout : a.layout, "a"),
    board(reverse ? a.layout : b.layout, "b"),
    {
      playerHp: hp,
      enemyHp: hp,
      playerCapacity: capacity,
      enemyCapacity: capacity,
      playerAdmin: reverse ? b.admin : a.admin,
      enemyAdmin: reverse ? a.admin : b.admin,
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
          ? "a"
          : "b",
    margin: own.hp / own.maxHp - foe.hp / foe.maxHp,
    time: battle.elapsed,
    load: own.load,
    lag: own.lag,
    income: own.income,
    metrics: { ...battle.metrics[own.name] },
    parts: own.parts.map((p) => ({
      type: p.type,
      damage: p.damage,
      fires: p.fires,
      period: p.period,
      earned: p.earned,
    })),
  };
}
export function runRepeatStudy(path: string) {
  const source = JSON.parse(readFileSync(path, "utf8")),
    selectedIds = [
      ...new Set<string>(
        source.exactAdmin.flatMap((r: { a: string; b: string }) => [r.a, r.b]),
      ),
    ];
  const selected = selectedIds.map((id) =>
    source.candidates.find((c: Candidate) => c.id === id),
  ) as Candidate[];
  const original = selected.find((c) => c.origin.endsWith("/four-oneclick"))!;
  const counters = selected.filter((c) => c !== original),
    rows: (ReturnType<typeof repeatDuel> & {
      variant: string;
      hp: number;
      capacity: number;
      slots: number;
      a: string;
      b: string;
      counterAdmin: string[];
      seatConsistent: boolean;
    })[] = [];
  for (const variant of REPEAT_VARIANTS)
    for (const hp of [220, 440, 660])
      for (const capacity of [26, 35])
        for (const slots of [0, 2]) {
          const a = {
            ...original,
            admin: ["server", "backup"].slice(0, slots),
          };
          for (const counter of counters)
            for (const admin of adminChoices(slots)) {
              const b = { ...counter, admin },
                forward = repeatDuel(a, b, hp, capacity, variant.dials),
                reverse = repeatDuel(a, b, hp, capacity, variant.dials, true);
              rows.push({
                variant: variant.id,
                hp,
                capacity,
                slots,
                a: a.id,
                b: b.id,
                counterAdmin: admin,
                ...forward,
                seatConsistent:
                  forward.winner === reverse.winner &&
                  Math.abs(forward.margin - reverse.margin) < 1e-9 &&
                  forward.time === reverse.time,
              });
            }
        }
  const summary = REPEAT_VARIANTS.flatMap((v) =>
    [220, 440, 660].flatMap((hp) =>
      [26, 35].flatMap((capacity) =>
        [0, 2].map((slots) => {
          const r = rows.filter(
            (r) =>
              r.variant === v.id &&
              r.hp === hp &&
              r.capacity === capacity &&
              r.slots === slots,
          );
          return {
            variant: v.id,
            hp,
            capacity,
            slots,
            matches: r.length,
            wins: r.filter((r) => r.winner === "a").length,
            draws: r.filter((r) => r.winner === "draw").length,
            worstMargin: Math.min(...r.map((r) => r.margin)),
            meanTime: r.reduce((n, r) => n + r.time, 0) / r.length,
            meanIncome: r.reduce((n, r) => n + r.income, 0) / r.length,
            meanNaturalAttacks:
              r.reduce((n, r) => n + r.metrics.naturalAttacks, 0) / r.length,
            meanSpent: r.reduce((n, r) => n + r.metrics.spent, 0) / r.length,
          };
        }),
      ),
    ),
  );
  const copyChecks = [1, 2, 3, 4].flatMap((copies) => {
    let kept = 0;
    const a = {
      ...original,
      layout: original.layout.filter(
        (p) => p[0] !== "am_oneclick" || kept++ < copies,
      ),
    };
    return REPEAT_VARIANTS.filter(
      (v) => v.id === "canonical" || v.id.startsWith("repeat2-"),
    ).flatMap((v) =>
      [220, 440, 660].flatMap((hp) =>
        [0, 2].map((slots) => {
          const own = { ...a, admin: ["server", "backup"].slice(0, slots) },
            foe = {
              ...counters[0],
              admin: ["server", "backup"].slice(0, slots),
            };
          return {
            copies,
            variant: v.id,
            hp,
            slots,
            resources: resources(own.layout),
            ...repeatDuel(own, foe, hp, 26, v.dials),
          };
        }),
      ),
    );
  });
  return {
    note: "Isolated diagnostic subclass only. Canonical production unchanged. Source is a verified search winner, not original authored Cart. Both sides receive each dial symmetrically. Natural-only ablations keep real natural notifications/income; conversion-only ablations keep charge spend so they isolate damage, not an alternative playable design. Copy-count checks remove outputs without refunding/re-spending inputs and are not equal-budget strategy comparisons. Repeat-after-two candidates preserve one/two-copy clocks, base damage, income growth and charge damage; they introduce a pagewide natural-clock multiplier only for third and later copies. Full administrator re-optimization and open-composition re-search are required before promoting a candidate.",
    path,
    original,
    counters,
    variants: REPEAT_VARIANTS,
    orderedBattles: rows.length * 2,
    seatMismatches: rows.filter((r) => !r.seatConsistent).length,
    summary,
    copyChecks,
    rows,
  };
}
export function runRepeatAdminStudy(path: string) {
  const source = JSON.parse(readFileSync(path, "utf8"));
  const selectedIds = [
    ...new Set<string>(
      source.exactAdmin.flatMap((r: { a: string; b: string }) => [r.a, r.b]),
    ),
  ];
  const selected = selectedIds.map((id) =>
    source.candidates.find((c: Candidate) => c.id === id),
  ) as Candidate[];
  const original = selected.find((c) => c.origin.endsWith("/four-oneclick"))!,
    counters = selected.filter((c) => c !== original),
    choices = adminChoices(2);
  const results = REPEAT_VARIANTS.filter((v) =>
    ["canonical", "repeat2-0.25", "repeat2-0.3"].includes(v.id),
  ).map((variant) => {
    const byCounter = counters.map((counter) => ({
      id: counter.id,
      origin: counter.origin,
      matrix: choices.map((own) =>
        choices.map((foe) => {
          const result = repeatDuel(
            { ...original, admin: own },
            { ...counter, admin: foe },
            440,
            35,
            variant.dials,
          );
          return {
            winner: result.winner,
            margin: result.margin,
            time: result.time,
          };
        }),
      ),
    }));
    const options = choices.map((admin, i) => {
      const games = byCounter.flatMap((c) => c.matrix[i]);
      return {
        admin,
        wins: games.filter((g) => g.winner === "a").length,
        draws: games.filter((g) => g.winner === "draw").length,
        total: games.length,
        worstMargin: Math.min(...games.map((g) => g.margin)),
        meanMargin: games.reduce((s, g) => s + g.margin, 0) / games.length,
      };
    });
    const seatMismatches = counters.flatMap((counter) =>
      choices.flatMap((own, i) => {
        const foe = choices[(i + 7) % choices.length],
          a = { ...original, admin: own },
          b = { ...counter, admin: foe };
        const f = repeatDuel(a, b, 440, 35, variant.dials),
          r = repeatDuel(a, b, 440, 35, variant.dials, true);
        return f.winner === r.winner &&
          Math.abs(f.margin - r.margin) < 1e-9 &&
          f.time === r.time
          ? []
          : [{ a: a.id, b: b.id, own, foe, f, r }];
      }),
    );
    return {
      variant: variant.id,
      bestWorst: [...options].sort(
        (a, b) => b.worstMargin - a.worstMargin || b.wins - a.wins,
      )[0],
      bestWins: [...options].sort(
        (a, b) =>
          b.wins - a.wins || b.draws - a.draws || b.worstMargin - a.worstMargin,
      )[0],
      anyPairBeatsAll: options.some((r) => r.wins === r.total),
      options,
      byCounter,
      seatMismatches,
    };
  });
  return {
    note: "Both sides exhaust all36 legal two-admin pairs for the same six sampled layouts. HP440/CPU35 only; repeated-cadence remains an isolated experimental subclass and no composition is re-optimized here.",
    path,
    original,
    counters,
    choices,
    comparisons: results.length * counters.length * choices.length ** 2,
    seatChecked: results.length * counters.length * choices.length,
    results,
  };
}
export function runRepeatSearch(
  seed: number,
  capacity: number,
  iterations: number,
  extraWeight: number,
) {
  class RepeatAfterTwoProbe extends OneClickAblationBattle {
    constructor(
      a: Item[],
      b: Item[],
      options: ConstructorParameters<typeof OneClickAblationBattle>[2] = {},
    ) {
      super(a, b, options, { repeatCadence: { freeCopies: 2, extraWeight } });
    }
  }
  return {
    ...runSearch(
      seed,
      { ...DEFAULT_LIMITS, capacity },
      iterations,
      RepeatAfterTwoProbe,
    ),
    repeatCadence: { freeCopies: 2, extraWeight },
  };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const path = process.argv[2];
  if (!path) throw Error("Pass the cross-search robustness report");
  const arg = (name: string, fallback: number) =>
    Number(
      process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ??
        fallback,
    );
  console.log(
    JSON.stringify(
      process.argv.includes("--search")
        ? runRepeatSearch(
            arg("seed", 101),
            arg("capacity", 26),
            arg("iterations", 1200),
            arg("weight", 0.25),
          )
        : process.argv.includes("--admin")
          ? runRepeatAdminStudy(path)
          : runRepeatStudy(path),
      null,
      2,
    ),
  );
}
