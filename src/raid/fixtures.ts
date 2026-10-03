import { canonicalTypeFor, sealRaidBlueprint } from "./blueprint.js";
import type {
  RaidAppearance,
  RaidBlueprint,
  RaidComponent,
  RaidPrimitive,
} from "./types.js";
import type { Rect } from "../types.js";

const R = (x: number, y: number, w: number, h: number): Rect => ({
  x,
  y,
  w,
  h,
});
const text = (
  value: string,
  rect: Rect,
  size = 16,
  color = "#233042",
  font: "sans" | "serif" | "mono" = "sans",
): RaidPrimitive => ({
  kind: "text",
  rect,
  text: value,
  color,
  size,
  weight: "normal",
  font,
  align: "left",
});
const box = (
  rect: Rect,
  fill: string,
  radius = 0,
  borderColor = fill,
  borderWidth = 0,
): RaidPrimitive => ({
  kind: "rect",
  rect,
  fill,
  radius,
  borderColor,
  borderWidth,
});
function component(
  index: number,
  evidence: RaidComponent["evidence"],
  rect: Rect,
  label: string,
  background: string,
  foreground: string,
  font: "sans" | "serif" | "mono" = "sans",
  radius = 0,
): RaidComponent {
  const appearance: RaidAppearance = {
    width: rect.w,
    height: rect.h,
    background,
    primitives: [
      text(
        label,
        R(
          12,
          Math.max(2, (rect.h - 28) / 2),
          Math.max(1, rect.w - 24),
          Math.min(28, rect.h - 2),
        ),
        Math.min(20, rect.h - 4),
        foreground,
        font,
      ),
      box(R(0, 0, rect.w, rect.h), background, radius, foreground, 1),
    ],
  };
  // The border is painted first; keep text first in the descriptor for stable extraction identity.
  return {
    componentId: `component-${String(index).padStart(2, "0")}`,
    canonicalType: canonicalTypeFor(evidence),
    sourceRect: { ...rect },
    combatRect: { ...rect },
    appearanceId: "appearance_" + "0".repeat(64),
    appearance,
    evidence,
  };
}
const FIXTURES = [
  {
    id: "archive",
    name: "星見文庫",
    description: "古い個人サイト風の公開テストページ",
  },
  {
    id: "commerce",
    name: "暮らしの道具店",
    description: "商品ページ風の公開テストページ",
  },
] as const;
export function listRaidFixtures() {
  return FIXTURES.map((f) => ({ ...f }));
}
export async function createFixtureRaid(id: string): Promise<RaidBlueprint> {
  const fixture = FIXTURES.find((f) => f.id === id);
  if (!fixture) throw new Error("検証用ページが見つかりません。");
  const archive = id === "archive";
  const base: Omit<RaidBlueprint, "captureId"> = {
    schemaVersion: 1,
    extractorVersion: "static-v1",
    mapperVersion: "canonical-v1",
    viewport: { width: 960, height: 680 },
    source: {
      kind: "fixture",
      name: fixture.name,
      displayUrl: `fixture://${id}`,
      capturedAt: "2026-10-02T00:00:00.000Z",
    },
    fidelity: "controlled-fixture",
    warnings: [
      "これは付属の検証用ページです。実サイトから取得したものではありません。",
    ],
    background: archive ? "#fffdf4" : "#f4f3ee",
    decor: archive
      ? [
          box(R(0, 0, 960, 72), "#183541"),
          text(
            "星見文庫  HOSHIMI ARCHIVE",
            R(30, 20, 750, 35),
            26,
            "#fffdf4",
            "serif",
          ),
          text(
            "インターネットの片隅から、日々の記録を。",
            R(36, 94, 780, 36),
            18,
            "#445760",
            "serif",
          ),
          box(R(32, 194, 204, 402), "#ede8d8"),
          text("CONTENTS", R(48, 208, 170, 25), 14, "#52696b", "mono"),
          text("今月の特集", R(280, 206, 620, 36), 24, "#233042", "serif"),
          text(
            "星を眺める夜、記録すること。",
            R(280, 258, 600, 32),
            18,
            "#51616b",
            "serif",
          ),
          text(
            "小さな検索欄と青いリンクでつながる個人の図書室。",
            R(280, 306, 624, 34),
            16,
            "#51616b",
            "serif",
          ),
          text(
            "この画面はUI RAIDの取得・回収を検証するための創作ページです。",
            R(32, 630, 896, 26),
            12,
            "#68767b",
          ),
        ]
      : [
          box(R(0, 0, 960, 78), "#273f3a"),
          text("暮らしの道具店", R(32, 22, 600, 36), 28, "#ffffff", "serif"),
          text(
            "つくり手の仕事を、毎日の暮らしへ。",
            R(32, 96, 880, 32),
            18,
            "#566c61",
          ),
          box(R(32, 205, 412, 322), "#d7dfd2"),
          box(R(130, 260, 215, 165), "#b48358", 32),
          text(
            "CERAMIC / DAILY TOOLS",
            R(74, 462, 340, 28),
            14,
            "#294637",
            "mono",
          ),
          text(
            "素材に触れて選ぶ",
            R(486, 206, 410, 32),
            23,
            "#273f3a",
            "serif",
          ),
          text(
            "手になじむ一品を集めた、小さな生活道具店。",
            R(486, 250, 410, 44),
            16,
            "#566c61",
          ),
        ],
    components: archive
      ? [
          component(
            0,
            "search",
            R(280, 144, 604, 42),
            "文庫を検索",
            "#ffffff",
            "#52696b",
          ),
          component(
            1,
            "navigation",
            R(48, 254, 172, 38),
            "蔵書一覧",
            "#ede8d8",
            "#2456a4",
            "serif",
          ),
          component(
            2,
            "navigation",
            R(48, 308, 172, 38),
            "読書の記録",
            "#ede8d8",
            "#2456a4",
            "serif",
          ),
          component(
            3,
            "navigation",
            R(48, 362, 172, 38),
            "季節の便り",
            "#ede8d8",
            "#2456a4",
            "serif",
          ),
          component(
            4,
            "pdf",
            R(280, 368, 604, 50),
            "□  星図をダウンロード PDF",
            "#e5ece9",
            "#24483f",
            "mono",
          ),
          component(
            5,
            "notice",
            R(280, 454, 604, 70),
            "お知らせ  新しい蔵書が届きました",
            "#fff3cc",
            "#6c5830",
            "serif",
          ),
        ]
      : [
          component(
            0,
            "search",
            R(32, 144, 896, 40),
            "道具を探す",
            "#ffffff",
            "#486055",
          ),
          component(
            1,
            "product",
            R(486, 300, 410, 150),
            "手仕事のマグカップ",
            "#f4f3ee",
            "#294637",
            "serif",
          ),
          component(
            2,
            "rating",
            R(486, 466, 410, 40),
            "★★★★★  大切に使いたい道具",
            "#f4f3ee",
            "#8a632e",
          ),
          component(
            3,
            "quantity",
            R(486, 520, 130, 42),
            "数量  1",
            "#ffffff",
            "#486055",
          ),
          component(
            4,
            "purchase",
            R(486, 580, 410, 52),
            "買い物かごに入れる",
            "#d99748",
            "#263d35",
            "sans",
            6,
          ),
          component(
            5,
            "navigation",
            R(32, 580, 412, 36),
            "つくり手と素材について →",
            "#f4f3ee",
            "#365e4d",
            "serif",
          ),
        ],
  };
  return sealRaidBlueprint(base);
}
