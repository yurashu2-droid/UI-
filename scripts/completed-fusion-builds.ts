/** Measured completed alternatives; recipe construction is not proof of a paid eight-round route. */
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import D from "../src/data.js";
import E from "../src/engine.js";
import R from "../src/run.js";
import { BUILDS } from "../src/builds.js";
import {
  board,
  resources,
  measureMatch,
  fusedEntrant,
  type Entrant,
} from "../src/buildlab.js";
import type { LayoutEntry } from "../src/types.js";
function construct(
  id: string,
  donors: LayoutEntry[],
  destination: LayoutEntry[],
  n: number,
  recipe: string,
) {
  assert.equal(resources(donors).legal, true);
  const run = R.newRun("lab");
  run.owned = board(donors, "d");
  run.nextId = 100;
  const fs = R.fuse(run);
  assert.equal(fs.length, n);
  assert.ok(fs.every((f) => f.recipe.into === recipe));
  for (const p of run.owned) assert.equal(R.move(run, p.id, null, null), true);
  const used = new Set<string>();
  for (const [t, x, y, w, h] of destination) {
    const p = run.owned.find((p) => p.type === t && !used.has(p.id));
    assert.ok(p);
    used.add(p.id);
    assert.equal(R.move(run, p.id, x, y, w, h), true);
  }
  assert.equal(used.size, run.owned.length);
  const layout: LayoutEntry[] = run.owned.map((p) => [
    p.type,
    p.x,
    p.y,
    p.w,
    p.h,
  ]);
  const res = resources(layout);
  assert.equal(res.legal, true);
  assert.equal(res.acquisitionValue, resources(donors).acquisitionValue);
  return {
    entrant: {
      id,
      name: id,
      build: true,
      admin: ["server", "backup"],
      layout,
    } as Entrant,
    donors,
    donorResources: resources(donors),
    resources: res,
    recipes: fs.map((f) => f.recipe.into),
    separatorNeighbors: [] as { attackText: string[] }[],
  };
}
export function completedFusionBuilds() {
  const donors: LayoutEntry[] = [
    ["gov_form", 16, 16, 920, 500],
    ["gov_breadcrumb", 32, 72, 560, 28],
    ...Array.from({ length: 6 }, (_, i): LayoutEntry[] => {
      const x = 32 + 296 * (i % 3),
        y = 108 + 152 * Math.floor(i / 3);
      return [
        ["gov_check", x, y, 232, 32],
        ["gov_submit", x, y + 40, 184, 40],
      ];
    }).flat(),
    ["gov_font", 32, 400, 232, 36],
    ["go_suggest", 272, 400, 420, 84],
  ];
  const final: LayoutEntry[] = [
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
  ];
  const six = construct("six-onestop", donors, final, 6, "gov_onestop");
  const buyDonors: LayoutEntry[] = [
    ...Array.from({ length: 4 }, (_, i): LayoutEntry[] => {
      const x = 24 + (i % 2) * 232,
        y = 24 + Math.floor(i / 2) * 184;
      return [
        ["am_cart", x, y, 200, 100],
        ["am_buy", x, y + 108, 128, 40],
      ];
    }).flat(),
    ["am_product", 488, 24, 448, 300],
    ["am_quantity", 488, 340, 112, 40],
    ["am_prime", 608, 340, 144, 40],
    ["am_rating", 488, 400, 280, 32],
    ["ab_counter", 488, 448, 288, 26],
  ];
  const buyFinal: LayoutEntry[] = [
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
  ];
  const four = construct(
    "four-oneclick",
    buyDonors,
    buyFinal,
    4,
    "am_oneclick",
  );
  const links: LayoutEntry[] = [];
  for (const x of [16, 320, 624]) {
    for (const y of [24, 100])
      for (const dx of [0, 96]) links.push(["ab_link", x + dx, y, 96, 24]);
    links.push(["gov_font", x, 56, 208, 36]);
    for (const y of [132, 148]) links.push(["ab_hr", x, y, 192, 8]);
  }
  links.push(["ab_guestbook", 24, 216, 320, 132]);
  const info = E.analyze(board(links, "l"));
  const separatorNeighbors = info.board
    .filter((p) => p.type === "ab_hr")
    .map((p) => ({
      attackText: info.near[p.id]
        .map((id) => info.board.find((p) => p.id === id)!)
        .filter(
          (p) =>
            D.PARTS[p.type].kind === "attack" &&
            D.PARTS[p.type].tags.includes("text"),
        )
        .map((p) => p.id),
    }));
  const native = {
    entrant: {
      id: "native-link-defense",
      name: "native-link-defense",
      build: true,
      admin: ["server", "backup"],
      layout: links,
    },
    donors: links,
    donorResources: resources(links),
    resources: resources(links),
    recipes: [],
    separatorNeighbors,
  };
  assert.equal(native.resources.legal, true);
  return [six, four, native];
}
export function completedFusionMatrix() {
  const constructed = completedFusionBuilds();
  const existing = [
    "b_cart",
    "b_fort_native",
    "b_documents_heavy",
    "b_video_checkout",
  ].map(
    (id) =>
      fusedEntrant({
        ...BUILDS.find((b) => b.id === id)!,
        build: true,
        admin: ["server", "backup"],
      }).entrant,
  );
  const entrants = [...constructed.map((r) => r.entrant), ...existing];
  const results = [17, 26, 35].flatMap((capacity) =>
    [0, 2].map((adminSlots) => {
      const conditions = {
        hp: 440,
        capacity,
        adminSlots,
        commonAdmin: ["server", "backup"],
      };
      return {
        conditions,
        matches: entrants.flatMap((a) =>
          entrants
            .filter((b) => a.id !== b.id)
            .map((b) => ({
              a: a.id,
              b: b.id,
              ...measureMatch(a, b, conditions),
            })),
        ),
      };
    }),
  );
  return {
    note: "Actual public fusion and legal repositioning; all recipe input values retained. All production parts. Common administrator choices isolate composition, without claiming those loot offers or completed inventories are naturally guaranteed. CPU17/26/35 are reachable plan totals; cost of the server plans is not included in part value. No extra blanket stat changes.",
    constructed,
    entrants: entrants.map((a) => ({ id: a.id, ...resources(a.layout) })),
    results,
  };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  console.log(JSON.stringify(completedFusionMatrix(), null, 2));
