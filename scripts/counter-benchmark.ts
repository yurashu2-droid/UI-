/** Same-price replacement probes: popup replaces cart, cache replaces a font booster. */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { measureMatch, resources, type Entrant } from "../src/buildlab.js";
import type { LayoutEntry } from "../src/types.js";
const make = (id: string, layout: LayoutEntry[]): Entrant => ({
  id,
  name: id,
  layout,
  admin: [],
  build: true,
});
const core: LayoutEntry[] = [
  ["am_newsletter", 24, 24, 280, 60],
  ["am_cart", 24, 92, 280, 100],
  ["gov_pdf", 24, 208, 280, 48],
  ["gov_font", 24, 264, 232, 36],
  ["ab_hr", 24, 320, 560, 16],
];
const pdf: LayoutEntry[] = [
  ["gov_pdf", 24, 24, 440, 48],
  ["go_page", 472, 24, 320, 36],
  ["gov_page", 472, 64, 280, 36],
  ["gov_font", 24, 80, 232, 36],
  ["go_suggest", 264, 80, 200, 84],
];
const links: LayoutEntry[] = [
  ...Array.from({ length: 8 }, (_, i): LayoutEntry => [
    i < 6 ? "ab_link" : "ab_nav",
    24 + (i % 4) * 200,
    24 + Math.floor(i / 4) * 40,
    192,
    32,
  ]),
  ["gov_font", 24, 112, 232, 36],
];
export function counterProbes() {
  const cart = make("cart", core),
    popup = make(
      "popup",
      core.map((r) =>
        r[0] === "am_cart"
          ? (["ad_popup", ...r.slice(1)] as LayoutEntry)
          : [...r],
      ),
    );
  const targets = [
    make("concentrated", pdf),
    make("distributed", links),
    make(
      "cached-concentrated",
      pdf.map((r) =>
        r[0] === "gov_font" ? ["go_cache", r[1], r[2], 232, 44] : [...r],
      ),
    ),
  ];
  const conditions = { hp: 240, capacity: 30, adminSlots: 0 };
  return targets.map((target) => {
    const control = measureMatch(cart, target, conditions),
      intervention = measureMatch(popup, target, conditions);
    return {
      target: target.id,
      controlCost: resources(cart.layout),
      popupCost: resources(popup.layout),
      targetCost: resources(target.layout),
      marginDelta:
        intervention.hpA - intervention.hpB - (control.hpA - control.hpB),
      control,
      intervention,
    };
  });
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  console.log(
    JSON.stringify(
      {
        note: "Diagnostic replacement probes; not acceptance by themselves",
        rows: counterProbes(),
      },
      null,
      2,
    ),
  );
