/** Cross-search verification; input reports are local deterministic benchmark artifacts. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import {
  BATTLE_RULES_VERSION,
  isSupportedCombatVersion,
  type CombatRulesVersion,
} from "../src/combat-rules.js";
import {
  adminChoices,
  assessCandidate,
  duel,
  type Candidate,
  type Limits,
} from "./open-build-search.js";

export function inspectReports(paths: string[]) {
  return paths.flatMap((path, index) => {
    const report = JSON.parse(readFileSync(path, "utf8"));
    return report.finalists.map((row: { candidate: Candidate }) => ({
      ...row.candidate,
      id: `search${index}-${row.candidate.id}`,
      origin: `seed${report.seed}/${row.candidate.origin}`,
    })) as Candidate[];
  });
}
export function adminResponseMatrix(
  a: Candidate,
  b: Candidate,
  limits: Limits,
) {
  const choices = adminChoices(limits.adminSlots);
  const games = choices.map((own) =>
    choices.map((foe) =>
      duel({ ...a, admin: own }, { ...b, admin: foe }, limits),
    ),
  );
  const margins = games.map((row) => row.map((g) => g.margin));
  const rows = margins.map((values, i) => ({
    admin: choices[i],
    worstMargin: Math.min(...values),
    wins: games[i].filter((g) => g.winner === "a").length,
    draws: games[i].filter((g) => g.winner === "draw").length,
  }));
  const columns = choices.map((admin, i) => {
    const values = margins.map((row) => -row[i]);
    return {
      admin,
      worstMargin: Math.min(...values),
      wins: games.filter((row) => row[i].winner === "b").length,
      draws: games.filter((row) => row[i].winner === "draw").length,
    };
  });
  const best = (rows: typeof columns) =>
    [...rows].sort(
      (a, b) => b.worstMargin - a.worstMargin || b.wins - a.wins,
    )[0];
  const seatMismatches = choices.flatMap((admin, i) => {
    const forward = duel(
      { ...a, admin },
      { ...b, admin: choices[(i + 7) % choices.length] },
      limits,
    );
    const reverse = duel(
      { ...b, admin: choices[(i + 7) % choices.length] },
      { ...a, admin },
      limits,
    );
    return Math.abs(forward.margin + reverse.margin) > 1e-9 ||
      forward.time !== reverse.time
      ? [{ i, forward, reverse }]
      : [];
  });
  return {
    a: a.id,
    b: b.id,
    limits,
    choices,
    margins,
    winners: games.map((row) => row.map((g) => g.winner)),
    bestA: best(rows),
    bestB: best(columns),
    aCanBeatEveryAdmin: rows.some((r) => r.wins === choices.length),
    bCanBeatEveryAdmin: columns.some((r) => r.wins === choices.length),
    comparisons: choices.length ** 2,
    seatChecked: choices.length,
    seatMismatches,
  };
}
export function runRobustness(
  paths: string[],
  capacity = 35,
  combatVersion: CombatRulesVersion = BATTLE_RULES_VERSION,
) {
  const candidates = inspectReports(paths),
    limits: Limits = {
      budget: 75,
      combatVersion,
      capacity,
      hp: 440,
      adminSlots: 2,
      footprint: 960 * 680,
      productionOnly: true,
    };
  const keys = new Set<string>();
  const admissible = candidates.filter((c) => {
    if (!assessCandidate(c, limits).legal) return false;
    const k = JSON.stringify([
      c.layout
        .map((r) => r.slice(0, 5))
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
      [...c.admin].sort(),
    ]);
    if (keys.has(k)) return false;
    keys.add(k);
    return true;
  });
  const excluded = candidates
    .filter((c) => !assessCandidate(c, limits).legal)
    .map((c) => ({ id: c.id, resources: assessCandidate(c, limits) }));
  const tiers = [...new Set([26, capacity])].flatMap((battleCapacity) =>
    [220, 440, 660].flatMap((hp) =>
      [0, 2].map((adminSlots) => {
        const l = {
            ...limits,
            hp,
            adminSlots,
            capacity: battleCapacity,
            maxLoad: capacity,
          },
          players = admissible.map((c) => ({
            ...c,
            admin: c.admin.slice(0, adminSlots),
          }));
        const matches = players.flatMap((a, i) =>
          players
            .slice(i + 1)
            .map((b) => ({ a: a.id, b: b.id, ...duel(a, b, l) })),
        );
        const scores = players
          .map((c) => ({
            id: c.id,
            origin: c.origin,
            wins: matches.filter(
              (m) =>
                (m.a === c.id && m.winner === "a") ||
                (m.b === c.id && m.winner === "b"),
            ).length,
            draws: matches.filter(
              (m) => (m.a === c.id || m.b === c.id) && m.winner === "draw",
            ).length,
          }))
          .sort((a, b) => b.wins - a.wins || b.draws - a.draws);
        return {
          limits: l,
          overloaded: players
            .filter((c) => assessCandidate(c, l).load > battleCapacity)
            .map((c) => c.id),
          scores,
          matches,
        };
      }),
    ),
  );
  // Select the best member of each broad origin from the cross-search round robin, not hand-picked anti-Cart layouts.
  const ranked = tiers.find(
    (t) =>
      t.limits.hp === 440 &&
      t.limits.adminSlots === 2 &&
      t.limits.capacity === capacity,
  )!.scores;
  const kinds = new Set<string>(),
    selected: Candidate[] = [];
  for (const row of ranked) {
    const c = admissible.find((c) => c.id === row.id)!;
    const family = c.origin.split("/")[1].replace(/-fused$/, "");
    if (!kinds.has(family)) {
      kinds.add(family);
      selected.push(c);
    }
    if (selected.length === 6) break;
  }
  const exactAdmin = selected.flatMap((a, i) =>
    selected.slice(i + 1).map((b) => adminResponseMatrix(a, b, limits)),
  );
  const jointAdminResponses = selected.map((candidate) => {
    const relevant = exactAdmin.filter(
      (r) => r.a === candidate.id || r.b === candidate.id,
    );
    const options = adminChoices(limits.adminSlots)
      .map((admin, i) => {
        const games = relevant.flatMap((r) =>
          r.choices.map((_, j) => ({
            margin: r.a === candidate.id ? r.margins[i][j] : -r.margins[j][i],
            win:
              r.a === candidate.id
                ? r.winners[i][j] === "a"
                : r.winners[j][i] === "b",
            draw:
              r.a === candidate.id
                ? r.winners[i][j] === "draw"
                : r.winners[j][i] === "draw",
          })),
        );
        return {
          admin,
          wins: games.filter((g) => g.win).length,
          draws: games.filter((g) => g.draw).length,
          total: games.length,
          worstMargin: Math.min(...games.map((g) => g.margin)),
        };
      })
      .sort((a, b) => b.worstMargin - a.worstMargin || b.wins - a.wins);
    return { id: candidate.id, best: options[0], options };
  });
  return {
    note: "Cross-search challenge across HP220/440/660 and zero/two admins. Exact duplicate layout/admin configurations are deduplicated. Source seeds train independently; this is cross-seed validation, not a human meta distribution. Admission uses the requested max capacity, then the SAME layouts are re-evaluated at CPU26 and the requested capacity; overloaded boards are labelled and incur real engine penalties. Six distinct source families selected by combined HP440 round-robin receive a complete 36×36 two-admin cross-product at the requested capacity; both sides can choose any legal pair. All revenue routing is automatic; explicit routeTo optimization is outside this search. This only certifies these sampled geometries/resource/HP conditions. No tuning or paid acquisition claim.",
    paths,
    limits,
    candidates: admissible,
    excluded,
    duplicatesRemoved: candidates.length - excluded.length - admissible.length,
    tiers,
    exactAdmin,
    jointAdminResponses,
    exactComparisons: exactAdmin.reduce((n, r) => n + r.comparisons, 0),
    seatChecked: exactAdmin.reduce((n, r) => n + r.seatChecked, 0),
    seatMismatches: exactAdmin.flatMap((r) => r.seatMismatches),
  };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const paths = process.argv.slice(2).filter((a) => !a.startsWith("--")),
    capacity = Number(
      process.argv.find((a) => a.startsWith("--capacity="))?.split("=")[1] ??
        35,
    );
  if (paths.length < 2) throw Error("Provide at least two search report paths");
  const version =
    process.argv
      .find((a) => a.startsWith("--combat-version="))
      ?.split("=")[1] ?? BATTLE_RULES_VERSION;
  if (!isSupportedCombatVersion(version))
    throw new Error("Unsupported robustness combat version");
  console.log(JSON.stringify(runRobustness(paths, capacity, version), null, 2));
}
