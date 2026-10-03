/** Paired opt-in audience experiments; resource differences are intentional and reported. */
import D from "../src/data.js";
import { BUILDS } from "../src/builds.js";
import { measureMatch, resources, type Entrant } from "../src/buildlab.js";
import type { ExperimentalRules } from "../src/experimental-combat.js";
import type { LayoutEntry } from "../src/types.js";
export function advertisingEntrant(
  ads: number,
  subscription: boolean,
): Entrant {
  if (!Number.isInteger(ads) || ads < 0 || ads > 6)
    throw new Error("Choose 0–6 advertisements");
  const layout: LayoutEntry[] = [
    ["yt_play", 24, 24, 480, 270],
    ["yt_progress", 24, 294, 480, 22],
    ["yt_speed", 24, 316, 104, 40],
    ["am_cart", 680, 24, 256, 400],
  ];
  if (subscription) layout.push(["yt_sub", 128, 316, 184, 40]);
  for (let i = 0; i < ads; i++)
    layout.push(["yt_ad", 512, 24 + i * 56, 160, 48]);
  return {
    id: `ads-${ads}-sub-${subscription}`,
    name: `広告${ads} / 会員${subscription ? "あり" : "なし"}`,
    build: true,
    layout,
    admin: [],
  };
}
export function audienceBenchmarks() {
  const opponents: Entrant[] = BUILDS.filter((b) =>
    ["b_links", "b_cart", "b_echo"].includes(b.id),
  ).map((b) => ({
    ...b,
    build: true,
    layout: b.layout.filter((r) => D.PARTS[r[0]].status !== "experimental"),
  }));
  const variants: ExperimentalRules[] = [
    null,
    "audience-v1",
    "navigation-audience-v1",
  ];
  const profiles = [0, 1, 2, 4, 6].flatMap((n) =>
    [false, true].map((sub) => advertisingEntrant(n, sub)),
  );
  return {
    note: "Deterministic controlled geometry, not equal invested budgets or population win rates. All variants are opt-in and retain the same input boards. Ads use real natural activations; no generated traffic is counted.",
    resources: profiles.map((a) => ({ id: a.id, ...resources(a.layout) })),
    matches: variants.flatMap((experimentalRules) =>
      profiles.flatMap((a) =>
        opponents.map((b) => ({
          a: a.id,
          b: b.id,
          ...measureMatch(a, b, {
            hp: 440,
            capacity: 35,
            adminSlots: 0,
            experimentalRules,
          }),
        })),
      ),
    ),
  };
}
if (process.argv[1]?.endsWith("audience-benchmark.ts"))
  console.log(JSON.stringify(audienceBenchmarks(), null, 2));
