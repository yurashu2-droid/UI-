import type { PartDefinition } from "../types.js";

type SocialRow = [string, string, "twitter" | "x", string, string, string, number, number, number, number, number, number, string];
const rows: SocialRow[] = [
  ["tw_post", "140字のつぶやき", "twitter", "attack", "text social post", "social-post", 520, 108, 2.2, 5, 2, 4,
    "2.2秒ごとに5ダメージ。短文を軽く回す時系列の投稿。文字強化・近接リツイートと連携する。"],
  ["tw_retweet", "リツイート", "twitter", "echo", "text social control", "button", 128, 32, 5, 0.35, 2, 5,
    "5秒ごとに近接する攻撃の最後の通常発動を35%で再配信。原本の発動前は待機し、再配信から再配信や収益は起きない。"],
  ["tw_favorite", "お気に入り ☆", "twitter", "shield", "social control", "button", 128, 32, 4, 4, 1, 3,
    "4秒ごとにシールド4。小さな星でこまめに閲覧者を引き留める。操作列に連結できる。"],
  ["tw_follow", "フォローする", "twitter", "heal", "social control", "button", 132, 32, 5, 3, 1, 4,
    "5秒ごとにHP3回復。常連を少しずつ呼び戻す軽いフォローボタン。実際のアカウントは操作しない。"],
  ["x_post", "長文ポスト", "x", "attack", "text social post", "social-post", 480, 140, 3.6, 10, 3, 6,
    "3.6秒ごとに10ダメージ。つぶやきより重い一撃だが、面積とCPUを使う。文字強化と引用の対象になる。"],
  ["x_quote", "引用ポスト", "x", "echo", "text social quote", "social-quote", 480, 124, 6, 0.65, 3, 7,
    "6秒ごとに近接する攻撃の最後の通常発動を65%で引用。大きな引用枠とCPUが必要。原本の発動前や妨害中は引用できない。"],
  ["x_note", "コミュニティの補足", "x", "shield", "text social trust", "social-note", 480, 92, 6, 12, 2, 6,
    "6秒ごとにシールド12。背景情報を添えて引き留める。補足そのものは攻撃せず、botや広告を無条件に無効化しない。"],
  ["x_bookmark", "ブックマーク", "x", "heal", "social control", "button", 144, 36, 6, 7, 2, 5,
    "6秒ごとにHP7回復。保存した投稿へ閲覧者が戻る。フォローより回復は大きいが重く、発動も遅い。"],
];

export const SOCIAL_PARTS: Record<string, PartDefinition> = Object.fromEntries(
  rows.map(([id, name, faction, kind, tags, layout, w, h, cd, value, load, price, desc]) => [id, {
    id, name, faction, kind, tags: tags.split(" "), layout, w, h, cd, value, load, price, desc,
    added: true, status: "experimental", minW: layout === "button" ? 112 : 288,
    minH: layout === "button" ? 28 : h, maxW: layout === "button" ? 320 : 760,
    maxH: layout === "button" ? 56 : 240,
  } satisfies PartDefinition]),
);
