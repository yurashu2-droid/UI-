/** Replays one fixed compact counter and its real paid paths. No search or input injection here. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BUILDS } from "../src/builds.js";
import { BATTLE_RULES_VERSION } from "../src/combat-rules.js";
import { resources } from "../src/buildlab.js";
import { simulateCompositionPath } from "./paid-target-benchmark.js";
import {
  assessCandidate,
  compositionKey,
  duel,
  type Candidate,
  type Limits,
} from "./open-build-search.js";

export function runReachableCounter(
  firstSeed = 101,
  seeds = 30,
  opponents: Candidate[] = [],
) {
  assert.ok(
    Number.isInteger(firstSeed) &&
      Number.isInteger(seeds) &&
      seeds > 0 &&
      seeds <= 100,
    "Invalid paid cohort",
  );
  const build = BUILDS.find((b) => b.id === "b_search_documents")!;
  const target = { ...build, build: true };
  const conditions: Limits = {
    budget: 40,
    capacity: 17,
    hp: 300,
    adminSlots: 0,
    footprint: 960 * 680,
    productionOnly: true,
    combatVersion: BATTLE_RULES_VERSION,
  };
  const candidate: Candidate = {
    id: build.id,
    origin: "connected-search-refinement",
    layout: build.layout,
    admin: [],
  };
  assert.ok(assessCandidate(candidate, conditions).legal);
  const compare = (subject: Candidate) =>
    opponents.map((o) => {
      // The measured no-admin slice removes admins from BOTH sampled layouts.
      const opponent = { ...o, admin: [] };
      assert.ok(
        assessCandidate(opponent, conditions).legal,
        "Invalid benchmark opponent",
      );
      const forward = duel(subject, opponent, conditions),
        reverse = duel(opponent, subject, conditions);
      const consistent =
        Math.abs(forward.margin + reverse.margin) < 1e-9 &&
        forward.time === reverse.time &&
        forward.winner ===
          (reverse.winner === "a"
            ? "b"
            : reverse.winner === "b"
              ? "a"
              : "draw");
      assert.ok(consistent, "Reversed-seat mismatch");
      return {
        opponent,
        opponentResources: resources(opponent.layout),
        forward,
        reverse,
        consistent,
      };
    });
  const matches = compare(candidate);
  const original = opponents.find(
    (o) => compositionKey(o) === compositionKey(candidate),
  );
  const beforeRefinement = original
    ? {
        candidate: { ...original, admin: [] },
        resources: resources(original.layout),
        matches: compare({ ...original, admin: [] }),
      }
    : null;
  const rows = Array.from({ length: seeds }, (_, i) =>
    simulateCompositionPath(firstSeed + i, target),
  );
  const completions = rows.flatMap((row) => {
    const reached = row.rounds.find((r) => r.targetLayoutComplete);
    if (!reached) return [];
    const paid = row.transactions.filter(
      (t) => t.round <= reached.round && ["buy", "reroll"].includes(t.kind),
    );
    return [
      {
        seed: row.seed,
        round: reached.round,
        targetInputs: reached.targetTotal,
        outputs: reached.outputsOwned,
        inventorySize: reached.board.length,
        load: reached.load,
        capacity: reached.capacity,
        actualAdmin: reached.admin,
        partSpend: paid
          .filter((t) => t.kind === "buy" && !t.type.startsWith("plan:"))
          .reduce((s, t) => s + t.cost, 0),
        serverSpend: paid
          .filter((t) => t.type.startsWith("plan:"))
          .reduce((s, t) => s + t.cost, 0),
        rerollSpend: paid
          .filter((t) => t.kind === "reroll")
          .reduce((s, t) => s + t.cost, 0),
      },
    ];
  });
  return {
    note: "Fixed geometry, real offers/purchases/loot/rerolls/selected post-battle fusion. Ingredient ownership, produced outputs, and exact target placement are distinct. A completed target is a subset of the real inventory; paid bridge UI can still add CPU. Administrators are actual offered rewards; the preset baseline has none. No-admin completed duels use HP300/CPU17 against supplied legal <=$40 layouts, with measured cost differences, not universal win rates. Paid policies are bounded heuristics, not optimal acquisition probabilities; source shortlist was selected before this preset was added.",
    beforeRefinement,
    rulesVersion: BATTLE_RULES_VERSION,
    target,
    resources: resources(target.layout),
    conditions,
    firstSeed,
    seeds,
    summary: {
      paths: rows.length,
      exactTargetLayouts: completions.length,
      round8: rows.filter((p) => p.rounds.some((r) => r.round === 8)).length,
      campaignWins: rows.reduce((s, p) => s + p.wins, 0),
      fusions: rows
        .flatMap((p) => p.transactions)
        .filter((t) => t.kind === "fusion").length,
      blocked: rows.filter((p) => p.blocked).length,
      completedWins: matches.filter((m) => m.forward.winner === "a").length,
      completedDraws: matches.filter((m) => m.forward.winner === "draw").length,
      completedLosses: matches.filter((m) => m.forward.winner === "b").length,
      orderedMatches: matches.length * 2,
      seatMismatches: matches.filter((m) => !m.consistent).length,
    },
    completions,
    matches,
    rows,
  };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const arg = (name: string, fallback: number) =>
    Number(
      process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ??
        fallback,
    );
  const source = process.argv.find((a) => a.startsWith("--search="))?.slice(9);
  const opponents = source
    ? JSON.parse(readFileSync(source, "utf8")).finalists.map(
        (f: { candidate: Candidate }) => f.candidate,
      )
    : [];
  console.log(
    JSON.stringify(
      runReachableCounter(arg("first-seed", 101), arg("seeds", 30), opponents),
      null,
      2,
    ),
  );
}
