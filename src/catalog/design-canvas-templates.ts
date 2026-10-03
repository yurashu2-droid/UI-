import type { SiteTemplate } from "./types.js";

/** Fixed design-tool chrome; containment comes only from the three native parts. */
export const DESIGN_CANVAS_TEMPLATES: SiteTemplate[] = [{
  id: "site_figma",
  name: "Figma風（入れ子と直接の親）",
  faction: "designcanvas",
  pageName: "FRAMESET / 入れ子の資料棚",
  address: "archive://templates/design-canvas",
  hp: 440, fee: 0, reward: 0, admin: [], status: "experimental",
  tip: "3部品・$16・CPU8。PDFを内側のtableに入れると、その枠のシールドが4→7。PDFだけを下の外側フォームへ移すと、PDFは20%加速する代わりにtableの追加シールドを失う。外側まで含めた面積とCPUは同じ。",
  loot: ["gov_form", "ab_table", "gov_pdf"],
  inspiredBy: "Figmaのキャンバス、レイヤー欄、プロパティ欄と、フレームを入れ子にして親子関係を作る考え方を参考にした架空の画面。中央は既存の電子申請フォーム・table・PDFの標本をそのまま配置する独自のゲーム教材。左右の欄とツール列は初期構成の固定見本で、編集サービスの再現や実際のプロパティ表示ではない。原作のコード・画像・ロゴ・ファイルは使わず、公式サービスとは無関係。",
  references: [
    "https://help.figma.com/hc/en-us/articles/360041539473-Frames-in-Figma-Design",
    "https://help.figma.com/hc/en-us/articles/360039959014-Parent-child-and-sibling-relationships",
    "https://help.figma.com/hc/en-us/articles/15297425105303-Explore-design-files",
  ],
  counterplay: "直接の親は一つだけ。初期PDFの親はtableで、外のフォームの20%加速を重ねて受けない。table自身はフォーム直下なので20%加速する。PDFを(260,412)へ動かすとフォーム直下になり、tableは文字の子を失って1回7→4シールド。PDFの1回18・50%貫通は変わらない。24秒・CPU12・追加設備なし・3リンクからの被弾を続ける測定では、初期は72ダメージ/112シールド、移動後は90/82。上限60へ達した余剰シールドは無駄になる。外のフォームは480×368の面積とCPU3、内側tableはCPU2を使い続け、背景のキャンバスに防御効果はない。両配置とも$14/CPU4の文字強化付き3リンクに両席で敗れる限定例。最適な完成形や通常ショップの入手保証ではなく、直接の親を選ぶ教材。回復・収益・再発動はない。",
  layout: [
    ["gov_form", 224, 128, 480, 368, null, "資料棚 / 外側の申請枠"],
    ["ab_table", 244, 200, 440, 176, null, "資料棚 / 内側のtable"],
    ["gov_pdf", 260, 254, 280, 48, null, "余白と文字の見本.pdf"],
  ],
  decor: [
    ["canvas-layers", 16, 16, 168, 608],
    ["canvas-workspace", 216, 12, 488, 24],
    ["canvas-frame-caption", 224, 96, 480, 24],
    ["canvas-properties", 728, 16, 216, 608],
    ["canvas-lesson", 216, 516, 488, 120],
    ["canvas-tools", 320, 646, 280, 28],
    ["canvas-local-note", 16, 640, 168, 34],
    ["canvas-status", 728, 640, 216, 34],
  ],
}];
