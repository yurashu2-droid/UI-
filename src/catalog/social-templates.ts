import type { SiteTemplate } from "./types.js";
export type { SiteTemplate } from "./types.js";

/** Original fictional pages based on publicly documented web conventions, not scraped assets. */
export const SOCIAL_TEMPLATES: SiteTemplate[] = [
  {
    id: "site_twitter_classic", name: "旧Twitter風（2010年代）", faction: "twitter",
    pageName: "chirp. / 140字のタイムライン", address: "archive://templates/twitter-classic",
    hp: 440, fee: 0, reward: 0, admin: ["sns"],
    tip: "短文を軽く回し、RTとお気に入りでつなぐ時系列型。大技より手数と省CPUが特徴。",
    loot: ["tw_post", "tw_retweet", "tw_favorite", "tw_follow"], status: "experimental",
    inspiredBy: "2010年代初頭のTwitterの時系列・詳細ペイン・140字・RT・お気に入り。公式サービスとは無関係。",
    references: ["https://blog.x.com/en_us/a/2010/a-better-twitter", "https://blog.x.com/en_us/a/2011/introducing-the-follow-button"],
    counterplay: "軽い攻撃を分散する代わりに、大きな貫通や継続的な収益成長は持たない。性能は実験中。",
    layout: [
      ["tw_post", 24, 144, 568, 108, null, "新しいホームページ、できました。リンクは自由にどうぞ。"],
      ["tw_retweet", 24, 252, 128, 32],
      ["tw_favorite", 152, 252, 128, 32],
      ["tw_follow", 280, 252, 132, 32],
      ["tw_post", 24, 296, 568, 108, null, "検索窓の隣に買い物ボタンを置いたら、ちょっと便利になった。"],
      ["tw_retweet", 24, 404, 128, 32],
      ["tw_favorite", 152, 404, 128, 32],
      ["tw_post", 24, 448, 568, 108, null, "深夜のインターネットは、だいたい青いリンクでできている。"],
      ["tw_follow", 24, 556, 132, 32],
    ],
    decor: [
      ["tw-timeline", 24, 0, 568, 40], ["tw-composer", 24, 44, 568, 88],
      ["tw-profile", 616, 24, 320, 164], ["tw-trends", 616, 208, 320, 204],
      ["tw-discover", 616, 432, 320, 192], ["tw-footer", 24, 612, 568, 44],
    ],
  },
  {
    id: "site_x", name: "X風", faction: "x", pageName: "Crossline / おすすめの会話",
    address: "archive://templates/x", hp: 440, fee: 0, reward: 0, admin: ["moderator"],
    tip: "大きなポストを引用し、補足と保存で保つ複合型。引用枠の面積と立ち上がりを支払う。",
    loot: ["x_post", "x_quote", "x_note", "x_bookmark"], status: "experimental",
    inspiredBy: "Xの縦ナビゲーション、おすすめ／フォロー中、引用、背景情報、保存のUI慣習。公式サービスとは無関係。",
    references: ["https://help.x.com/en/using-x/x-timeline", "https://help.x.com/en/using-x/community-notes"],
    counterplay: "攻撃がポストとその引用へ集中する。対象を覆う妨害や、引用準備中の速攻に対する調整が必要。",
    layout: [
      ["x_post", 200, 64, 456, 140, null, "Webの部品は、時代が違ってもつながる。今日はその続きを作っています。"],
      ["x_quote", 200, 212, 456, 124, null, "この組み合わせ、別のページでも試してみたい。"],
      ["x_bookmark", 200, 344, 144, 36],
      ["x_note", 200, 400, 456, 92, null, "背景情報：この画面は架空のUIモチーフです。実際の投稿や購入は行いません。"],
      ["x_post", 200, 512, 456, 140, null, "古いリンク集と新しい動画を同じページに。きれいに揃わないところが、いい。"],
    ],
    decor: [
      ["x-navigation", 16, 16, 160, 628], ["x-feed-tabs", 200, 0, 456, 48],
      ["x-premium", 680, 16, 256, 164], ["x-trends", 680, 196, 256, 264],
      ["x-discover", 680, 484, 256, 164],
    ],
  },
];
