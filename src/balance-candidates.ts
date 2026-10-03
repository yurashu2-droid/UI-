/** Laboratory-only counter candidate. This does not promote its components to progression. */
import type { Entrant } from "./buildlab.js";
import type { LayoutEntry } from "./types.js";
export function fortressCandidate(base: Entrant): Entrant {
  if (base.id !== "b_fort") throw new Error("Expected fortress base");
  const layout: LayoutEntry[] = base.layout
    .filter((r) => r[0] !== "ab_hr")
    .map((r) => {
      if (r[0] === "gov_accordion") return ["gov_rate_limit", 472, 36, 328, 88];
      if (r[0] === "gov_page") return ["gov_font", 232, 260, 208, 36];
      if (r[0] === "gov_pdf") return [r[0], r[1], r[2], 184, r[4], r[5], r[6]];
      return [...r];
    });
  return {
    ...base,
    id: "b_fort_limiter",
    name: base.name + " / 429実験",
    layout,
  };
}

/** Production-part composition, not a shop grant or replacement for the authored preset. */
export function nativeFortressCandidate(base: Entrant): Entrant {
  const layout: LayoutEntry[] = [];
  for (let i = 0; i < 2; i++) {
    const x = 24 + i * 464;
    layout.push(
      ["gov_form", x, 36, 456, 360],
      ["ab_table", x + 16, 92, 208, 136],
      ["gov_pdf", x + 28, 168, 184, 48],
      ["ab_table", x + 232, 92, 208, 136],
      ["gov_pdf", x + 244, 168, 184, 48],
      ["gov_font", x + 124, 236, 208, 36],
      ["gov_submit", x + 16, 284, 184, 40],
    );
  }
  return {
    id: "b_fort_native",
    name: "書類の二重防壁 / 試作",
    build: true,
    layout,
    admin: [...base.admin],
  };
}
/** Heavy piercing pressure for checking that shield-oriented composition has an opponent. */
export function heavyDocumentCandidate(base: Entrant): Entrant {
  const layout: LayoutEntry[] = [];
  for (let i = 0; i < 3; i++) {
    const y = i * 216;
    layout.push(
      ["gov_font", 24, y + 64, 208, 36],
      ["gov_pdf", 240, y + 24, 184, 48],
      ["gov_pdf", 240, y + 80, 184, 48],
      ["go_suggest", 432, y + 40, 420, 84],
    );
  }
  return {
    id: "b_documents_heavy",
    name: "厚い資料束 / 試作",
    build: true,
    layout,
    admin: [...base.admin],
  };
}
/** Measured media/commerce alternative; both embedded players retain priced fusion inputs. */
export function videoCheckoutCandidate(base: Entrant): Entrant {
  return {
    id: "b_video_checkout",
    name: "動画の広告チェックアウト",
    build: true,
    admin: [...base.admin],
    layout: [
      ["yt_embed", 24, 24, 600, 300],
      ["yt_speed", 24, 324, 104, 40],
      ["yt_autoplay", 128, 324, 176, 40],
      ["yt_caption", 304, 324, 88, 40],
      ["yt_like", 392, 324, 112, 40],
      ["yt_notify", 504, 324, 72, 40],
      ["yt_ad", 24, 372, 600, 64],
      ["yt_embed", 648, 24, 288, 162],
      ["yt_speed", 648, 186, 104, 40],
      ["yt_sub", 648, 234, 288, 40],
      ["am_cart", 648, 282, 288, 100],
    ],
  };
}
