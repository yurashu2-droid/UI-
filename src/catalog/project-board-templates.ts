import type { SiteTemplate } from "./types.js";

/** A visual board composition only: its lanes are not gameplay containers. */
export const PROJECT_BOARD_TEMPLATES: SiteTemplate[] = [{
  id: "site_trello",
  name: "Trello風（添付と参照の配置）",
  faction: "projectboard",
  pageName: "PATCHBOARD / 小さなホームページの制作ボード",
  address: "archive://templates/project-board",
  hp: 440, fee: 0, reward: 0, admin: [], status: "experimental",
  tip: "5部品・$23・CPU8。左の出典は隣のPDFを35%で再発動。出典だけを中央のリンク直下へ動かすと、同じ材料でも参照する攻撃が変わる。列や進捗ラベルは表示のみ。",
  loot: ["gov_pdf", "wk_reference", "gh_checks"],
  inspiredBy: "Trelloの横並びのリスト、カードのラベル、添付ファイルとチェックリストを参考にした架空の制作ボード。原作のコードや画像を使わず、標準UIを組み合わせたゲーム上の配置例。公式サービスとは無関係。",
  references: [
    "https://support.atlassian.com/trello/docs/creating-a-new-board/",
    "https://support.atlassian.com/trello/docs/moving-cards-or-lists/",
  ],
  counterplay: "同じ出典をPDFの下からリンクの下へ動かすと、50%貫通を持つPDFの再発動から普通のリンクの再発動へ変化する。遠くへ置けば原本がなく待機。列の背景は本当の親枠ではなく、離れたチェックもページ全体を守る。回復・収益・キャッシュはなく、2つの試作UIを含むため通常ショップでの入手性を示すものではない。",
  layout: [
    ["gov_pdf", 16, 236, 288, 48, null, "画面づくりの要件.pdf"],
    ["wk_reference", 16, 300, 288, 52, null, "添付ファイルの出典"],
    ["ab_link", 336, 252, 288, 32, null, "ページのつなぎ方を見る"],
    ["gov_check", 336, 384, 232, 32, null, "キーボード操作を確認"],
    ["gh_checks", 656, 236, 288, 128, null, "公開前のチェック"],
  ],
  decor: [
    ["board-toolbar", 16, 20, 928, 52],
    ["board-lane-idea", 16, 92, 288, 32],
    ["board-lane-progress", 336, 92, 288, 32],
    ["board-lane-done", 656, 92, 288, 32],
    ["board-card-brief", 16, 144, 288, 80],
    ["board-card-build", 336, 144, 288, 80],
    ["board-card-check", 656, 144, 288, 80],
    ["board-attachment-note", 24, 380, 272, 112],
    ["board-checkbox-note", 344, 436, 272, 64],
    ["board-checks-note", 664, 460, 272, 64],
    ["board-lesson", 16, 548, 928, 68],
    ["board-local-note", 16, 636, 928, 28],
  ],
}];
