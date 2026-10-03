/** Explicit-condition benchmarks. No win-rate target substitutes for resource/counter evidence. */
import D from "../src/data.js";
import { fortressCandidate } from "../src/balance-candidates.js";
import { BUILDS } from "../src/builds.js";
import { BATTLE_RULES_VERSION } from "../src/combat-rules.js";
import {
  measureMatch,
  resources,
  fusedEntrant,
  type MatchConditions,
  type Entrant,
} from "../src/buildlab.js";

const list: Entrant[] = BUILDS.map((b) => ({ ...b, build: true }));
const profiles: {
  id: string;
  description: string;
  budget: number | null;
  conditions: MatchConditions;
}[] = [
  {
    id: "core",
    description:
      "Natural build cores, no administration; unequal invested cost reported",
    budget: null,
    conditions: { hp: 440, capacity: 56, adminSlots: 0 },
  },
  {
    id: "common-ceiling",
    description:
      "Shared $100 acquisition ceiling and CPU35, unspent budget reported, no free additions",
    budget: 100,
    conditions: { hp: 440, capacity: 35, adminSlots: 0 },
  },
  {
    id: "two-slot-pressure",
    description:
      "CPU24 and two own admins; stress case, not a claim these complete boards are progression-reachable",
    budget: null,
    conditions: { hp: 440, capacity: 24, adminSlots: 2 },
  },
  {
    id: "showcase",
    description:
      "As-authored finished layouts, CPU56 and four own admins; not campaign-reachable admin allowance",
    budget: null,
    conditions: { hp: 440, capacity: 56, adminSlots: 4 },
  },
];
const results = profiles.map((profile) => ({
  profile,
  resources: list.map((a) => ({
    id: a.id,
    ...resources(a.layout),
    unspent:
      profile.budget === null
        ? null
        : profile.budget - resources(a.layout).acquisitionValue,
  })),
  matches: list.flatMap((a) =>
    list
      .filter((b) => a !== b)
      .map((b) => ({
        a: a.id,
        b: b.id,
        ...measureMatch(a, b, profile.conditions),
      })),
  ),
}));
const illegal = results[0].resources.filter((r) => !r.legal);
if (illegal.length) process.exitCode = 1;
const fused = list.map((a) => fusedEntrant(a));
const candidateList = list.map((a) =>
  a.id === "b_fort" ? fortressCandidate(a) : a,
);
const productionList = list.map((a) => ({
  ...a,
  layout: a.layout.filter((row) => D.PARTS[row[0]].status !== "experimental"),
}));
const extraCases = [
  {
    id: "production-filtered",
    note: "Experimental parts removed; retained-gold opportunities are reported, not filled for free. Not a reconstructed optimal progression build.",
    list: productionList,
  },
  {
    id: "post-fusion",
    note: "Accepted current fusion choices in lab; includes experimental parts where identified. Input material costs retained.",
    list: fused.map((f) => f.entrant),
  },
  {
    id: "limiter-candidate",
    note: "Experimental counter replacement; NOT obtainable in current campaign or online pools.",
    list: candidateList,
  },
].map((group) => ({
  id: group.id,
  note: group.note,
  results: profiles.map((profile) => ({
    profile,
    resources: group.list.map((a) => ({ id: a.id, ...resources(a.layout) })),
    matches: group.list.flatMap((a) =>
      group.list
        .filter((b) => a !== b)
        .map((b) => ({
          a: a.id,
          b: b.id,
          ...measureMatch(a, b, profile.conditions),
        })),
    ),
  })),
}));
const output = {
  rulesVersion: BATTLE_RULES_VERSION,
  extraCases,
  fusions: fused.map((f) => ({
    id: f.entrant.id,
    recipes: f.recipes,
    held: f.held,
  })),
  warning:
    "Deterministic scenario measurements, not population win rates. Complete archetypes have different acquisition paths. No automatic threshold tuning.",
  results,
};
if (process.argv.includes("--json"))
  console.log(JSON.stringify(output, null, 2));
else
  for (const r of results) {
    console.log(`\n${r.profile.id}: ${r.profile.description}`);
    console.table(r.resources);
    console.table(
      list.map((a) => ({
        build: a.id,
        wins: r.matches.filter((m) => m.a === a.id && m.winner === "player")
          .length,
        losses: r.matches.filter((m) => m.a === a.id && m.winner === "enemy")
          .length,
        draws: r.matches.filter((m) => m.a === a.id && m.winner === "draw")
          .length,
      })),
    );
  }
