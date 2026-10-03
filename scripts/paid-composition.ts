/** Geometry and completion for arbitrary paid targets. No inventory, offers or currency are granted. */
import assert from "node:assert/strict";
import C from "../src/document.js";
import D from "../src/data.js";
import R from "../src/run.js";
import { RECIPES } from "../src/fusion.js";
import { board, resources, type Entrant } from "../src/buildlab.js";
import type { Item, Run } from "../src/types.js";

export function validateCompositionTarget(target: Entrant) {
  assert.ok(target && target.layout.length > 0, "Empty composition target");
  assert.ok(
    target.layout.every(
      ([type, x, y]) =>
        D.PARTS[type] &&
        D.PARTS[type].status !== "experimental" &&
        x !== null &&
        y !== null,
    ),
    "Composition target must contain placed production parts",
  );
  assert.ok(
    resources(target.layout).legal,
    "Illegal composition target geometry",
  );
  return {
    ...structuredClone(target),
    layout: board(target.layout, "target").map(
      (p) =>
        [
          p.type,
          p.x,
          p.y,
          p.w,
          p.h,
          p.shape,
          p.label,
        ] as import("../src/types.js").LayoutEntry,
    ),
  };
}

/** Counts the actual outputs separately from recursively owned recipe ingredients. */
export function compositionProgress(items: Item[], target: Entrant) {
  const unused = new Set(items.map((p) => p.id));
  let outputsOwned = 0,
    outputsPlaced = 0,
    matchingGeometry = 0;
  for (const [type, x, y, w, h] of target.layout) {
    const matches = items.filter((p) => unused.has(p.id) && p.type === type);
    const exact = matches.find(
      (p) => p.x === x && p.y === y && p.w === w && p.h === h,
    );
    const item = exact ?? matches.find(C.placed) ?? matches[0];
    if (!item) continue;
    unused.delete(item.id);
    outputsOwned++;
    if (C.placed(item)) outputsPlaced++;
    if (exact) matchingGeometry++;
  }
  return {
    outputsTotal: target.layout.length,
    outputsOwned,
    outputsPlaced,
    targetLayoutComplete: matchingGeometry === target.layout.length,
  };
}

/** Each returned donor pair must survive a real battle before the caller consumes it. */
export function arrangeComposition(
  run: Run,
  target: Entrant,
): [string, string][] {
  for (const p of run.owned) assert.equal(R.move(run, p.id, null, null), true);
  const unused = new Set(run.owned.map((p) => p.id));
  const take = (type: string) =>
    run.owned.find((p) => unused.has(p.id) && p.type === type);
  // Containers first, as in an editor: children can only be placed after their parent.
  const rows = [...target.layout].sort(
    (a, b) =>
      Number(!!D.PARTS[b[0]].container) - Number(!!D.PARTS[a[0]].container),
  );
  const missing: string[] = [];
  for (const [type, x, y, w, h] of rows) {
    const p = take(type);
    if (!p) {
      missing.push(type);
      continue;
    }
    assert.equal(
      R.move(run, p.id, x, y, w, h),
      true,
      "Composition target placement: " + type,
    );
    unused.delete(p.id);
  }
  const pairs: [string, string][] = [];
  for (const type of missing) {
    const recipe = RECIPES.find((r) => r.into === type);
    if (!recipe) continue;
    const a = take(recipe.a),
      b = take(recipe.b);
    if (!a || !b || a.id === b.id) continue;
    const ad = D.PARTS[a.type],
      bd = D.PARTS[b.type];
    let placed = false;
    // Pair positions are actually paid battle geometry, not post-battle adjacency edits.
    for (
      let y = 16;
      !placed && y + Math.max(ad.minH, bd.minH) <= D.HEIGHT;
      y += 8
    ) {
      for (let x = 16; !placed && x + ad.minW + bd.minW <= D.WIDTH; x += 8) {
        if (!C.canPlace(run.owned, a, x, y, ad.minW, ad.minH)) continue;
        assert.equal(R.move(run, a.id, x, y, ad.minW, ad.minH), true);
        if (C.canPlace(run.owned, b, x + ad.minW, y, bd.minW, bd.minH)) {
          assert.equal(
            R.move(run, b.id, x + ad.minW, y, bd.minW, bd.minH),
            true,
          );
          placed = true;
        } else assert.equal(R.move(run, a.id, null, null), true);
      }
    }
    if (placed) {
      a.fusionLocked = false;
      b.fusionLocked = false;
      unused.delete(a.id);
      unused.delete(b.id);
      assert.ok(
        R.fusionPairs(run.owned, { pair: [a.id, b.id] }).some(
          (p) => p.recipe.into === type,
        ),
      );
      pairs.push([a.id, b.id]);
    }
  }
  for (const p of run.owned.filter((p) => unused.has(p.id))) {
    const d = D.PARTS[p.type],
      spot = C.findSpace(run.owned, { ...p, w: d.minW, h: d.minH });
    if (spot)
      assert.equal(R.move(run, p.id, spot.x, spot.y, d.minW, d.minH), true);
  }
  return pairs;
}
