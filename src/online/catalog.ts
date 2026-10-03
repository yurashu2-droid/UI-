import D from "../data.js";
import R from "../run.js";
import { RECIPES } from "../fusion.js";

/** Shared browser/server gameplay fingerprint; text, source artwork and provenance are excluded. */
export function arenaCatalogDefinition() {
  return {
    parts: Object.fromEntries(
      Object.entries(D.PARTS)
        // Isolated placed-UI lab prototype is not part of the online contract.
        .filter(([, p]) => p.kind !== "server-pressure")
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([id, p]) => [
          id,
          {
            faction: p.faction,
            kind: p.kind,
            tags: p.tags,
            replayTags: [...(p.replayTags ?? [])].sort(),
            layout: p.layout,
            w: p.w,
            h: p.h,
            cd: p.cd,
            value: p.value,
            load: p.load,
            price: p.price,
            minW: p.minW,
            minH: p.minH,
            maxW: p.maxW,
            maxH: p.maxH,
            container: !!p.container,
            padding: p.padding,
            fused: !!p.fused,
            status: p.status ?? "balance-approved",
          },
        ]),
    ),
    admin: Object.keys(D.ADMIN).sort(),
    recipes: RECIPES.map(({ a, b, into }) => ({ a, b, into })),
    plans: Object.fromEntries(
      Object.entries(R.PLANS)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([id, p]) => [id, { cap: p.cap, price: p.price }]),
    ),
    width: D.WIDTH,
    height: D.HEIGHT,
    maxItems: D.MAX_ITEMS,
  };
}
export async function fingerprintJson(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return [...new Uint8Array(digest)]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}
