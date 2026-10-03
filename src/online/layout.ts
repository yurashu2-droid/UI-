import C from "../document.js";
import D from "../data.js";
import { RECIPES } from "../fusion.js";
import E from "../engine.js";
import type { Item } from "../types.js";
import type { Placement } from "./types.js";
export function placementPayload(board: Item[]): Placement[] {
  return board.map((p) => ({
    id: p.id,
    x: p.x,
    y: p.y,
    w: p.w,
    h: p.h,
    ...(p.routeTo ? { routeTo: p.routeTo } : {}),
  }));
}
export function placeItem(
  board: Item[],
  id: string,
  x: number | null,
  y: number | null,
  w?: number,
  h?: number,
): Item[] | null {
  const next = structuredClone(board),
    p = next.find((q) => q.id === id);
  if (!p) return null;
  if (x === null && y === null) {
    for (const child of [id, ...C.descendants(next, id)]) {
      const q = next.find((v) => v.id === child)!;
      q.x = null;
      q.y = null;
    }
    return next;
  }
  if (x === null || y === null) return null;
  const dx = p.x === null ? 0 : x - p.x,
    dy = p.y === null ? 0 : y - p.y;
  for (const child of C.descendants(next, id)) {
    const q = next.find((v) => v.id === child)!;
    if (q.x !== null && q.y !== null) {
      q.x += dx;
      q.y += dy;
    }
  }
  Object.assign(p, { x, y, w: w ?? p.w, h: h ?? p.h });
  if (!next.filter(C.placed).every((q) => C.canPlace(next, q, q.x, q.y)))
    return null;
  return next;
}

/** Match the combat engine's actual reachable conversion candidates. */
export function routeChoices(board: Item[], id: string): Item[] {
  const info = E.analyze(board),
    consumers = new Set(["am_cart", "am_oneclick", "ad_popup", "yt_tip"]);
  return info.board.filter(
    (p) =>
      p.id !== id &&
      consumers.has(p.type) &&
      ((info.near[id] ?? []).includes(p.id) ||
        (info.near[p.id] ?? []).includes(id)),
  );
}

/** All selectable recipes, without greedily consuming ingredients before the player chooses. */
export function onlineFusionChoices(board: Item[]) {
  const placed = board.filter(C.placed).filter((p) => !p.fusionLocked);
  if (placed.length < 2) return [];
  const near = E.analyze(placed).near;
  return RECIPES.filter(
    (recipe) => D.PARTS[recipe.into].status !== "experimental",
  ).flatMap((recipe) =>
    placed
      .filter((a) => a.type === recipe.a)
      .flatMap((a) =>
        placed
          .filter(
            (b) =>
              b.id !== a.id &&
              b.type === recipe.b &&
              (near[a.id] ?? []).includes(b.id),
          )
          .map((b) => ({ recipe, a, b })),
      ),
  );
}
