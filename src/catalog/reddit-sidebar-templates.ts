import type { SiteTemplate } from "./types.js";
import { COMMUNITY_TEMPLATES } from "./community-templates.js";

/** Ordinary editor locations for one owned link, not extra buttons or new rules. */
export const REDDIT_SIDEBAR_POSITIONS = {
  thread: { x: 100, y: 492 },
  reading: { x: 692, y: 492 },
  detached: { x: 692, y: 552 },
} as const;

const original = COMMUNITY_TEMPLATES.find((site) => site.id === "site_reddit")!;

/** A separate player-only lesson. Never replace the established Reddit opponent. */
export const REDDIT_SIDEBAR_TEMPLATES: SiteTemplate[] = [{
  id: "lesson_reddit_sidebar",
  name: "Reddit風・別教材（返信とサイドバー）",
  faction: "reddit",
  pageName: "threadly / 返信とサイドバーの配置教材",
  address: "archive://templates/reddit-sidebar-lesson",
  hp: 440, fee: 0, reward: 0, admin: [], loot: [], status: "experimental",
  labOpponent: false,
  tip: "自分用の別教材。8部品・素材額面$34・CPU14。返信内の青リンク1本を(100,492)から右の文字サイズ下(692,492)へ移す。リンクは6→9になる一方、返信の回復は12→8、出典は再発動する原本を失う。元のReddit対戦相手は変わりません。",
  inspiredBy: "Redditの投稿と返信の階層、投票カラム、コミュニティの右サイドバーに置く説明・関連リンクを参考にした、既存threadlyの独立した配置教材。見本の投稿と文字サイズUIは創作で、実際の投稿移動・コミュニティ編集・投票・外部サービスへの接続は行わない。現在のRedditの画面再現ではなく、公式コード・画像・ロゴ・アカウント情報は使わない。",
  references: [
    "https://support.reddithelp.com/hc/en-us/articles/15484474697748-Sidebar-Widgets",
    "https://support.reddithelp.com/hc/en-us/articles/360060422572-How-do-I-post-and-comment-on-Reddit",
    "https://support.reddithelp.com/hc/en-us/articles/7419626610708-What-are-upvotes-and-downvotes",
  ],
  counterplay: "実験室の自分用教材。既存Redditの7部品をそのまま写し、通常の文字サイズ1個を足した8部品・素材額面$34・CPU14。元の7部品の対戦相手は変更しない。青リンクだけを(100,492)から(692,492)へ移すと、文字強化で通常の6ダメージが9になる。直接内包した文字攻撃が投稿1種類だけになり、返信回復は12から8へ減る。投票は文字攻撃でなく、出典は再発動UIなので種類を補わない。出典が届く原本は初期のリンクだけで、移動後は再発動0になる。再発動が届く範囲と直接の親子関係は別。所持品・寸法・資金は同じだが、リンクが外へ出て占有面積は305,472→312,128px²となる。余白加算はどちらも+2。離した(692,552)では文字強化もない。通常combat-v4・双方HP10,000/CPU14・設備なし・0.05秒刻み24秒で、差分1個（$7/CPU4）を相手に初期286.4ダメージ/48回復/4再発動、移動後317/32/0。通常攻撃は両方49回。相手なしでは実回復0、余剰回復48/32。相手の初回時計だけを0.75秒遅らせる診断では最初の回復が余り、24秒の実回復は36/24になる。診断の位相変更は保存・通常開始へ適用しない。初期CPU12なら両方1.1倍の遅延と21.6HPの過負荷損失があり、24秒の与ダメージは254.3/284、通常攻撃44回。これらは未決着の有限時間測定。HP440/CPU14では、安い$20/CPU6・占有37,376px²の文字強化付き5リンクへ両席で敗北し、初期21.1秒・移動後19.75秒。CPU12では両方19.75秒で敗北。シールド・貫通・収益がなく、初期より火力が高くても生存時間は短くなり得る。リンクを初期位置へ戻し、文字サイズ自体を(316,492)へ動かす別案も合法。同じ8部品で内側の投稿とリンクを強化し、同じ24秒/HP10,000/CPU14/差分条件では357.8ダメージ・48回復・4再発動となる。二つのリンク位置だけが選択肢ではない。試作UIを含み、有償の入手経路・ショップ出現・最適な構成を示さない。投票・送信・外部ページ移動は行わない。",
  layout: [...structuredClone(original.layout), ["gov_font", 692, 444, 232, 36]],
  decor: [
    ["reddit-community", 24, 0, 912, 104],
    ["reddit-sidebar-title", 24, 108, 612, 20],
    ["reddit-sidebar-thread-note", 24, 264, 612, 18],
    ["reddit-sidebar-lesson", 664, 132, 272, 276],
    ["reddit-sidebar-font-seat", 664, 420, 272, 20],
    ["reddit-sidebar-reading-note", 664, 528, 272, 20],
    ["reddit-sidebar-detached-note", 664, 588, 272, 64],
    ["reddit-sidebar-footnote", 24, 652, 912, 24],
  ],
}];
