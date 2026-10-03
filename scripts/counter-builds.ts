/** Conditional native counters; no experimental part is required or silently promoted. */
import D from "../src/data.js";
import { BUILDS } from "../src/builds.js";
import {
  nativeFortressCandidate,
  heavyDocumentCandidate,
} from "../src/balance-candidates.js";
import {
  measureMatch,
  resources,
  fusedEntrant,
  type Entrant,
} from "../src/buildlab.js";
const base = (id: string): Entrant => ({
  ...BUILDS.find((b) => b.id === id)!,
  build: true,
});
const candidates = [
  nativeFortressCandidate(base("b_fort")),
  heavyDocumentCandidate(base("b_echo")),
];
const targets = [
  ...BUILDS.map((b) => ({
    ...b,
    build: true,
    layout: b.layout.filter((r) => D.PARTS[r[0]].status !== "experimental"),
  })),
  ...candidates,
];
const conditions = [
  { hp: 440, capacity: 35, adminSlots: 0 },
  { hp: 440, capacity: 24, adminSlots: 0 },
  { hp: 440, capacity: 35, adminSlots: 2 },
  { hp: 440, capacity: 24, adminSlots: 2 },
  { hp: 440, capacity: 56, adminSlots: 4 },
];
const matches = conditions.flatMap((condition) =>
  [false, true].flatMap((fuse) =>
    candidates.flatMap((a) =>
      targets
        .filter((b) => a.id !== b.id)
        .flatMap((b) => {
          const left = fuse ? fusedEntrant(a).entrant : a,
            right = fuse ? fusedEntrant(b).entrant : b;
          return [
            { a: a.id, b: b.id, fuse, ...measureMatch(left, right, condition) },
            { a: b.id, b: a.id, fuse, ...measureMatch(right, left, condition) },
          ];
        }),
    ),
  ),
);
console.log(
  JSON.stringify(
    {
      note: "Catalogue acquisition floors, not proof of a specific paid route. Capacity and administration are varied separately. Native fortress has shielding and no native healing; it is not the original preset. No constant changes or 429 promotion.",
      candidates: candidates.map((a) => ({
        ...a,
        resources: resources(a.layout),
      })),
      matches: [
        ...new Map(
          matches.map((m) => [
            JSON.stringify([m.conditions, m.fuse, m.a, m.b]),
            m,
          ]),
        ).values(),
      ],
    },
    null,
    2,
  ),
);
