import type { PartDefinition } from "../types.js";

type Row = [string, string, "nico" | "reddit", string, string, string, number, number, number, number, number, number, string, Partial<PartDefinition>?];
const rows: Row[] = [
  ["nc_player", "コメント動画プレイヤー", "nico", "attack", "video media", "media", 608, 342, 3, 10, 6, 8,
    "3秒ごとに10ダメージ。動画本体としてシークバー・字幕・2倍速と連結できる。流れるコメントからの再発動には、先に通常再生が必要。", { minW: 240, minH: 144 }],
  ["nc_comment", "流れるコメント入力", "nico", "echo", "text control media-control comment", "field", 360, 36, 4.5, 0.35, 1, 5,
    "4.5秒ごとに近接する動画の最後の通常再生を35%で再現。動画以外は対象にしない。幅広い入力欄を使うがCPUは軽い。再発動から収益や成長は生まれない。",
    { minW: 232, minH: 32, maxW: 640, maxH: 56, replayTags: ["video"] }],
  ["nc_tag", "動画タグ列", "nico", "attack", "text navigation tag", "tags", 344, 36, 2.8, 4, 1, 3,
    "2.8秒ごとに4ダメージ。タグをたどる小さな文字攻撃。文字強化と連携できるが、動画の2倍速は受けない。", { minW: 192, minH: 32, maxW: 768, maxH: 64 }],
  ["rd_post", "コミュニティ投稿", "reddit", "attack", "text social discussion", "discussion-post", 552, 128, 3.4, 8, 3, 5,
    "3.4秒ごとに8ダメージ。話題を届ける文字の投稿。返信スレッドに内包でき、別の種類の文章と会話を作れる。", { minW: 288, minH: 112, maxW: 760, maxH: 240 }],
  ["rd_vote", "投票カラム", "reddit", "attack", "social button vote", "vote", 48, 128, 2.2, 4, 1, 3,
    "2.2秒ごとに4ダメージ。幅の狭い縦型の投票欄。文字攻撃ではなく、返信スレッドの文章の種類には数えない。実際の投票は送信しない。", { minW: 40, minH: 88, maxW: 72, maxH: 160 }],
  ["rd_thread", "入れ子の返信スレッド", "reddit", "heal", "text social container discussion", "container", 612, 360, 6, 8, 3, 6,
    "6秒ごとにHP8回復。直接内包した文字攻撃が2種類以上なら+4。同じ投稿の複製・投票・再発動UIは種類を増やさない。返信を置く広い面積が必要。",
    { minW: 324, minH: 200, container: true, padding: [54, 16, 16, 16] }],
];
export const COMMUNITY_PARTS: Record<string, PartDefinition> = Object.fromEntries(rows.map(
  ([id, name, faction, kind, tags, layout, w, h, cd, value, load, price, desc, extra = {}]) => [id, {
    id, name, faction, kind, tags: tags.split(" "), layout, w, h, cd, value, load, price, desc,
    added: true, status: "experimental", minW: 288, minH: h, maxW: 880, maxH: 500, ...extra,
  } satisfies PartDefinition],
));
