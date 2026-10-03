import type { SiteTemplate } from "./types.js";

/** Original fixed discovery-board artwork; four ordinary native parts own all behavior. */
export const PINFIELD_TEMPLATES: SiteTemplate[] = [{
  id: "site_pinterest",
  name: "Pinterest風（ひらめきとCCの接続）",
  faction: "pinfield",
  pageName: "PINFIELD / ひらめきの棚",
  address: "archive://templates/pinfield",
  hp: 440, fee: 0, reward: 0, admin: [], status: "experimental",
  tip: "4部品・$20・CPU10。CCだけを動画の下(24,400)から検索の右(736,24)へ移すと、動画の25%貫通を失い検索が13ダメージになる。CCは字幕のまま。異種UIの接続はゲーム内の仕組みで、棚・図・チップは固定見本。",
  loot: ["go_search", "yt_play", "yt_caption", "ab_link"],
  inspiredBy: "Pinterestのアイデア検索、画像や動画を見つけるピン、GestaltのMasonryによる高さの違う項目の段組みを参考にした架空の発見ボード。紙・窓・葉を描く独自のCSS図形と三列の棚で、CCの移動を学ぶゲーム教材。現在のPinterest画面・推薦・保存機能の再現ではない。文章・棚の名前・図は創作で、公式コード・ロゴ・画像・アカウント情報は使わず、公式サービスとは無関係。",
  references: [
    "https://help.pinterest.com/en/article/search-for-ideas-on-pinterest",
    "https://help.pinterest.com/en/article/types-of-pins-on-pinterest",
    "https://github.com/pinterest/gestalt/blob/master/packages/gestalt/src/Masonry.tsx",
  ],
  counterplay: "同じ4所持品・$20・CPU10・占有103,104px²。CCだけを(24,400)から(736,24)へ動かすと、動画の25%貫通を失い、近いボタンによる検索の+2と横並びフォームの30%強化が働き、検索は(8+2)×1.3＝13になる。異種UIの接続はゲーム内の抽象化で、CCは字幕のまま、検索送信ボタンにはならない。(648,480)では両方に未接続。(736,26)なら近さは残るがフォームを失い検索は10。双方HP10,000・CPU12・設備なし・通常combat-v4・0.05秒刻みの24秒では、初期/検索横/未接続の順で、空の相手へ227/262/227、通知ベル6個へ35/61/31、8個へ33/15/15ダメージ。各配置30回の自然攻撃で、収益・回復・シールド・再発動・CPU遅延なし。ベル8個は$32/CPU8のシールドだけを測る相手で同額ではない。7個なら初期/検索横は33/31。8個相手の6秒では17/15だが、攻撃の初回だけ0.25秒早める診断では27/28に変わり、同じ診断の24秒では41/28。ベルの初回だけ0.5秒遅らせても24秒は41/28。両席で同じ結果だが、相手・開始位相・観測の終点に依存し、盾への万能な対策ではない。HP440では両配置とも、同額$20/CPU6・占有37,376px²の文字サイズと5リンクの合法な相手へ両席で18.4秒で敗れ、相手の残HPは274/249。最適な完成形・通常ショップの入手経路を保証しない。背景の図・棚名・チップは固定表示で、保存・投稿・アップロード・推薦・外部通信を行わない。",
  layout: [
    ["go_search", 24, 24, 704, 40, null, "紙と窓辺のアイデア"],
    ["yt_play", 24, 176, 288, 216],
    ["yt_caption", 24, 400, 88, 40],
    ["ab_link", 336, 344, 288, 32, null, "窓辺の紙と光を見に行く"],
  ],
  decor: [
    ["pinfield-search-note", 24, 68, 704, 16],
    ["pinfield-search-seat", 736, 68, 200, 16],
    ["pinfield-board-heading", 24, 96, 912, 36],
    ["pinfield-column-title", 24, 144, 288, 24],
    ["pinfield-paper-card", 336, 144, 288, 184],
    ["pinfield-window-card", 648, 160, 288, 272],
    ["pinfield-video-note", 128, 400, 184, 40],
    ["pinfield-video-detail", 24, 452, 288, 40],
    ["pinfield-link-note", 336, 388, 288, 60],
    ["pinfield-detached-title", 648, 448, 288, 24],
    ["pinfield-detached-note", 752, 480, 184, 40],
    ["pinfield-paper-strip", 24, 504, 288, 84],
    ["pinfield-window-strip", 336, 468, 288, 120],
    ["pinfield-offset-note", 648, 536, 288, 52],
    ["pinfield-comparison", 24, 604, 912, 68],
  ],
}];
