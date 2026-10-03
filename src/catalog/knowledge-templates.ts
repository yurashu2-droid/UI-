import type { SiteTemplate } from "./types.js";

export const KNOWLEDGE_TEMPLATES: SiteTemplate[] = [
  {
    id: "site_wikipedia", name: "Wikipedia風（百科事典）", faction: "wiki",
    pageName: "ページ百科 / ウェブ部品", address: "archive://templates/encyclopedia",
    hp: 440, fee: 0, reward: 0, admin: ["moderator"], status: "experimental",
    tip: "記事・出典・基礎情報をつなぐ読み物型。軽い脚注の再発動と、文字／書類の混成強化が特徴。",
    loot: ["wk_article", "wk_reference", "wk_infobox"],
    inspiredBy: "Wikipediaの見出し、固定目次、出典、言語と外観設定の慣習を用いた原作記事。公式サービスとは無関係。",
    references: ["https://diff.wikimedia.org/2023/01/18/wikipedias-new-look-makes-it-easier-to-use-for-everyone/"],
    counterplay: "大きな本文に面積を使い、貫通・収益・回復を持たない。脚注だけでは原本の発動前に攻撃できない。",
    layout: [
      ["wk_article", 208, 108, 500, 140, null, "ウェブ部品とは"],
      ["wk_reference", 208, 252, 500, 52, null, "出典：小さなページのつなぎ方"],
      ["wk_article", 208, 332, 500, 140, null, "構造と意味"],
      ["wk_reference", 208, 476, 500, 52, null, "参考文献：インターネットの余白"],
      ["wk_article", 208, 552, 500, 108, null, "関連する技術"],
      ["wk_infobox", 732, 108, 204, 252],
    ],
    decor: [
      ["wiki-title", 208, 0, 500, 54], ["wiki-tabs", 208, 64, 500, 32],
      ["wiki-contents", 24, 108, 160, 428], ["wiki-appearance", 732, 392, 204, 240],
      ["wiki-section", 208, 306, 500, 24], ["wiki-related", 24, 564, 160, 92],
    ],
  },
  {
    id: "site_github", name: "GitHub風（コードレビュー）", faction: "forge",
    pageName: "patch.garden / ui-garden", address: "archive://templates/code-review",
    hp: 440, fee: 0, reward: 0, admin: ["backup"], status: "experimental",
    tip: "差分の重い一撃をコミット履歴で再適用し、チェック結果で守るレビュー型。起動の遅さと面積を支払う。",
    loot: ["gh_diff", "gh_commit", "gh_checks"],
    inspiredBy: "GitHubのリポジトリタブ、変更差分、コミット、チェック結果の慣習を用いた架空プロジェクト。公式サービスとは無関係。",
    references: ["https://docs.github.com/en/pull-requests/reference/status-checks", "https://docs.github.com/en/get-started/start-your-journey/reviewing-your-proposed-changes"],
    counterplay: "差分はPDFのようにシールドを貫通しない。発動を待つ間の速攻や、原本UIへの妨害に対策が必要。",
    layout: [
      ["gh_commit", 24, 136, 640, 44, null, "ページの導線を整理する"],
      ["gh_diff", 24, 192, 640, 220, null, "src/page.ts"],
      ["gh_commit", 24, 420, 640, 44, null, "小さなUI同士を接続する"],
      ["gh_diff", 24, 476, 640, 168, null, "src/layout.css"],
      ["gh_checks", 688, 136, 248, 128],
    ],
    decor: [
      ["forge-tabs", 24, 0, 912, 44], ["forge-pr-title", 24, 60, 912, 64],
      ["forge-reviewers", 688, 284, 248, 200], ["forge-about", 688, 508, 248, 136],
    ],
  },
];
