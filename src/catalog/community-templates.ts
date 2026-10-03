import type { SiteTemplate } from "./types.js";

export const COMMUNITY_TEMPLATES: SiteTemplate[] = [
  {
    id: "site_niconico", name: "ニコニコ風（流れるコメント）", faction: "nico",
    pageName: "stream.note / みんなで見る小さなWeb", address: "archive://templates/comment-video",
    hp: 440, fee: 0, reward: 0, admin: ["adnet"], status: "experimental",
    tip: "動画・シーク・速度・コメントを一体化。コメントは動画の原本が発動してから流れ、タグは独立した文字導線になる。",
    loot: ["nc_player", "nc_comment", "nc_tag"],
    inspiredBy: "ニコニコの動画へ重なる流れるコメント、入力欄、コメント一覧、タグという慣習を使った架空の動画ページ。公式サービスとは無関係。",
    references: ["https://dwango.co.jp/business/web/", "https://dwango.co.jp/download/5441311117148160/"],
    counterplay: "大型プレイヤーへ攻撃が集中する。動画を覆われると、その動画を参照するコメントも一時的に働かない。広告収益だけでは相手を倒せない。",
    layout: [
      ["nc_player", 24, 64, 608, 342], ["yt_progress", 24, 406, 608, 22],
      ["yt_speed", 24, 428, 104, 40], ["nc_comment", 128, 428, 504, 40],
      ["nc_tag", 24, 484, 608, 36], ["yt_ad", 656, 340, 280, 80],
    ],
    decor: [
      ["nico-title", 24, 0, 912, 48], ["nico-comments-list", 656, 64, 280, 260],
      ["nico-uploader", 24, 544, 608, 96], ["nico-related", 656, 444, 280, 196],
    ],
  },
  {
    id: "site_reddit", name: "Reddit風（投票と返信）", faction: "reddit",
    pageName: "threadly / r/webparts", address: "archive://templates/threaded-community",
    hp: 440, fee: 0, reward: 0, admin: ["moderator"], status: "experimental",
    tip: "縦の投票欄、投稿、入れ子の返信。返信内に別種類の文字攻撃を入れると、会話の回復が強くなる。",
    loot: ["rd_post", "rd_vote", "rd_thread"],
    inspiredBy: "Redditの投稿・コメント脇の投票、コミュニティ単位の会話、入れ子の返信という慣習を使った架空ページ。公式サービスとは無関係。",
    references: ["https://support.reddithelp.com/hc/en-us/articles/7419626610708-What-are-upvotes-and-downvotes", "https://support.reddithelp.com/hc/en-us/articles/15484546290068-Community-settings"],
    counterplay: "入れ子の会話に面積とCPUを使い、回復の初回発動まで時間がかかる。同じ投稿や投票だけを増やしても多様な会話の補正は得られない。",
    layout: [
      ["rd_vote", 24, 132, 48, 128], ["rd_post", 84, 132, 552, 128, null, "自分だけのWebページ、どんな部品で作っていますか？"],
      ["rd_thread", 24, 286, 612, 360], ["rd_vote", 40, 340, 48, 128],
      ["rd_post", 100, 340, 520, 128, null, "私は青いリンクと動画を、同じページに置いています。"],
      ["ab_link", 100, 492, 208, 32, null, "参考：小さなページの記録"],
      ["wk_reference", 100, 548, 500, 52, null, "会話の出典を読み返す"],
    ],
    decor: [
      ["reddit-community", 24, 0, 912, 104], ["reddit-about", 664, 132, 272, 224],
      ["reddit-rules", 664, 380, 272, 266],
    ],
  },
];
