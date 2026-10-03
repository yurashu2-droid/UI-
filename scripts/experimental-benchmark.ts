/** Reproducible paired progression and finished-build comparisons for local hypotheses. */
import D from "../src/data.js";
import { BUILDS } from "../src/builds.js";
import { measureMatch, resources, type Entrant } from "../src/buildlab.js";
import type { ExperimentalRules } from "../src/experimental-combat.js";
import type { CombatRulesVersion } from "../src/combat-rules.js";
import { simulatePath, type Policy } from "./progression-benchmark.js";
const profiles: {
  id: string;
  combatVersion: CombatRulesVersion;
  experimentalRules: ExperimentalRules;
}[] = [
  { id: "baseline-v2", combatVersion: "combat-v2", experimentalRules: null },
  { id: "navigation-v3", combatVersion: "combat-v3", experimentalRules: null },
  {
    id: "audience-v2",
    combatVersion: "combat-v2",
    experimentalRules: "audience-v1",
  },
  {
    id: "audience-v3",
    combatVersion: "combat-v3",
    experimentalRules: "audience-v1",
  },
];
const count = Number(
  process.argv.find((x) => x.startsWith("--seeds="))?.split("=")[1] ?? 50,
);
if (!Number.isInteger(count) || count < 1 || count > 100)
  throw new Error("Choose 1–100 paired seeds");
const paths = profiles.flatMap((profile) =>
  Array.from({ length: count }, (_, i) => 101 + i).flatMap((seed) =>
    (["pressure", "economy", "navigation"] as Policy[]).map((policy) => ({
      profileId: profile.id,
      ...simulatePath(seed, policy, profile),
    })),
  ),
);
const list: Entrant[] = BUILDS.map((b) => ({
  ...b,
  build: true,
  layout: b.layout.filter((r) => D.PARTS[r[0]].status !== "experimental"),
}));
const core = profiles.flatMap((profile) =>
  list.flatMap((a) =>
    list
      .filter((b) => a !== b)
      .map((b) => ({
        profileId: profile.id,
        a: a.id,
        b: b.id,
        ...measureMatch(a, b, {
          hp: 440,
          capacity: 35,
          adminSlots: 0,
          ...profile,
        }),
      })),
  ),
);
const summary = profiles.flatMap((profile) =>
  (["pressure", "economy", "navigation"] as Policy[]).map((policy) => {
    const rows = paths.filter(
      (p) => p.profileId === profile.id && p.policy === policy,
    );
    return {
      ...profile,
      policy,
      paths: rows.length,
      wins: rows.reduce((n, p) => n + p.wins, 0),
      reachEight: rows.filter((p) => p.rounds.length === 8).length,
      acquisitionSpend: rows.reduce((n, p) => n + p.purchases, 0),
      rerollSpend: rows.reduce((n, p) => n + p.rerollCost, 0),
      legal: rows.every((p) => !p.blocked && p.rounds.every((r) => r.legal)),
    };
  }),
);
console.log(
  JSON.stringify(
    {
      note: "Fixed-seed real purchases, rerolls, battles and settlement. Catalogue cost is only a floor; pursuit costs are in the ledger. These heuristic policies are not optimal play or population win rates. Combat-v3 is current; audience variants remain opt-in.",
      summary,
      resources: list.map((a) => ({ id: a.id, ...resources(a.layout) })),
      core,
      paths,
    },
    null,
    2,
  ),
);
