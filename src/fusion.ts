import type { Faction, PartDefinition } from "./types.js";

/* UI fusion ("統合"): like Backpack Battles crafting. Two specific UIs that are near each other
   (touching, or members of the same composite) when a battle ends merge into one specialized UI
   from later web history. Fused UIs are never sold in shops; you only get them by building. */

export interface Recipe {
  a: string;
  b: string;
  into: string;
  /** The bit of web history the fusion tells. */
  story: string;
}

type Row = [id: string, name: string, faction: Faction, kind: string, tags: string, layout: string, w: number, h: number, cd: number, value: number, load: number, desc: string, extra?: Partial<PartDefinition>];
const ROWS: Row[] = [
  ["go_instant", "インスタント検索", "google", "attack", "text search", "search", 420, 44, 3, 12, 3,
    "3秒ごとに12ダメージ。近接する文字攻撃の威力+45%（サジェスト内蔵）。外付け候補とは強い方だけ適用。元の検索窓の異系統加算は失う。", { minW: 240 }],
  ["am_oneclick", "1-Click 購入", "amazon", "attack", "commerce button cart", "button", 208, 44, 2.4, 12, 3,
    "基本2.4秒ごとに12ダメージ（累計収益$5ごとに+1、最大+8）。ページに3個以上置くと、全ての自然発動間隔が2個を超えた数×25%長くなるゲーム内ルール。近接収益チャージ$3を消費する20ダメージの連動購入は変わらず、同じ収益を複製しない。", { minW: 128 }],
  ["yt_embed", "埋め込みプレイヤー", "youtube", "attack", "video media", "media", 560, 300, 2.5, 10, 5,
    "2.5秒ごとに10ダメージ。シークバー内蔵で威力+25%。操作ボタン列を直下につなげられる。", { minW: 240, minH: 144 }],
  ["ab_ticker", "ニュース速報テロップ", "retro", "attack", "text heading legacy", "marquee", 576, 40, 3.5, 11, 3,
    "3.5秒ごとに11ダメージ。流れる速報が、右か直下の攻撃UIを40%威力で再発動させる。", { minW: 200 }],
  ["ab_blog", "ブログのコメント欄", "retro", "heal", "text economy legacy", "guestbook", 320, 132, 4.5, 7, 3,
    "4.5秒ごとにHP7回復し、コメントが付くたび$1。掲示板がブログになった。"],
  ["gov_onestop", "ワンストップ電子申請", "gov", "attack", "document form button text", "button", 232, 40, 3.5, 14, 2,
    "3.5秒ごとに14ダメージ、30%はシールドを無視。発動ごとに$1の処理報酬。", { minW: 136 }],
  ["go_recaptcha", "reCAPTCHA", "google", "shield", "trust form document", "check", 280, 56, 4, 6, 2,
    "4秒ごとにシールド6。ページにあるだけで、相手のAI荒らし・リターゲティング広告を遮断し、AIサクラを見抜く。", { minW: 200 }],
  ["ad_retarget", "リターゲティング広告", "google", "reactive", "economy ad text", "banner", 280, 80, 0, 1, 2,
    "近くの動画・文字UIが通常の時間発動を行うたび$1。再発動と再発動コントローラは収益を生まない。さらに6秒ごとに追跡広告で相手の閲覧者HPを5奪う（reCAPTCHA/CAPTCHAで遮断）。"],
  ["am_newsletter", "メルマガ登録", "amazon", "income", "economy commerce link", "banner", 280, 60, 5, 3, 1,
    "5秒ごとに$3。どこに置いても配信される。"],
  ["yt_tip", "応援ボタン", "youtube", "reactive", "economy subscription support", "button", 224, 44, 0, 8, 2,
    "近くの収益チャージ$3をシールド8へ変換。カートと二重使用しない。元の購入攻撃・会員収益は失う。シールド上限では最大$6まで蓄積して待機。余剰も累計収益には残る。",
    { minW: 160, minH: 40, maxW: 480, maxH: 72, status: "experimental" }],
];
export const FUSED_PARTS: Record<string, PartDefinition> = Object.fromEntries(
  ROWS.map(([id, name, faction, kind, tags, layout, w, h, cd, value, load, desc, extra = {}]) => [
    id,
    {
      id,
      name,
      faction,
      kind,
      tags: tags.split(" "),
      layout,
      w,
      h,
      cd,
      value,
      load,
      price: 0,
      desc,
      added: false,
      minW: Math.min(w, layout === "button" ? 72 : layout === "link" ? 80 : 140),
      minH: Math.min(h, 28),
      maxW: 920,
      maxH: 500,
      fused: true,
      ...extra,
    } satisfies PartDefinition,
  ]),
);

export const RECIPES: Recipe[] = [
  { a: "go_search", b: "go_suggest", into: "go_instant", story: "2010年、検索は“打ち終わる前”に始まった。" },
  { a: "am_buy", b: "am_cart", into: "am_oneclick", story: "1999年、購入はワンクリックになった。" },
  { a: "yt_play", b: "yt_progress", into: "yt_embed", story: "動画は、どのページにも埋め込めるようになった。" },
  { a: "ab_heading", b: "ab_marquee", into: "ab_ticker", story: "流れる文字は、速報テロップに進化した。" },
  { a: "ab_guestbook", b: "ab_counter", into: "ab_blog", story: "2003年、掲示板とカウンターはブログになった。" },
  { a: "gov_check", b: "gov_submit", into: "gov_onestop", story: "確認と送信が、ひとつの画面にまとまった。" },
  { a: "gov_check", b: "go_voice", into: "go_recaptcha", story: "“私はロボットではありません”の誕生。" },
  { a: "yt_ad", b: "go_ads", into: "ad_retarget", story: "広告は、あなたを追いかけ始めた。" },
  { a: "ab_mail", b: "am_coupon", into: "am_newsletter", story: "メールアドレスは、クーポンと交換された。" },
  { a: "am_buy", b: "yt_sub", into: "yt_tip", story: "購入の仕組みと会員登録が、作り手を応援するボタンになった。" },
];
