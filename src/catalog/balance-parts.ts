import type { PartDefinition } from "../types.js";

/** First balance experiments. Values are starting hypotheses, not measured approvals. */
export const BALANCE_PARTS: Record<string, PartDefinition> = {
  go_jobs: {
    id: "go_jobs", name: "自動閲覧ジョブ一覧", faction: "google", kind: "server-pressure",
    tags: ["bot", "pressure"], layout: "job-table",
    w: 280, h: 112, cd: 4, value: 6, load: 3, price: 7,
    desc: "実験室のサーバー負荷ルール限定。隣の収益から$3を払い、基本4秒ごとに一時作業+6を5秒送る。相手ページ全体で上限12。蓄積$6まで。CAPTCHAで拒否されても支払い済み。再発動・広告の収益源にはならない。余剰CPUなら無害。",
    added: true, status: "experimental", minW: 248, minH: 112, maxW: 560, maxH: 224,
  },
  ad_popup: {
    id: "ad_popup", name: "ポップアップ広告", faction: "google", kind: "interference",
    tags: ["economy", "ad", "interference"], layout: "banner",
    w: 280, h: 88, cd: 6, value: 0.8, load: 3, price: 7,
    desc: "収益チャージ$3を使い、6秒ごとに敵の攻撃UIを1つだけ0.8秒覆う。その間の通常発動・再発動を止める。蓄積は最大$6。余剰も累計収益には残る。キャッシュで防がれる。",
    added: true, status: "experimental", minW: 200, minH: 76, maxW: 640, maxH: 132,
  },
  go_cache: {
    id: "go_cache", name: "キャッシュ表示", faction: "google", kind: "cache",
    tags: ["search", "cache", "control"], layout: "link",
    w: 248, h: 44, cd: 8, value: 1, load: 2, price: 5,
    desc: "接続した攻撃UIを1つだけ保護し、次のポップアップ妨害を1回防ぐ。初期チャージ1、基本8秒で再充填（接続補正・負荷で変化）。保持は1回分。攻撃や回復はしない。",
    added: true, status: "experimental", minW: 192, minH: 40, maxW: 480, maxH: 72,
  },
  go_history: {
    id: "go_history", name: "変更履歴・版を復元", faction: "google", kind: "restore",
    tags: ["text", "document", "history", "control"], layout: "version-history",
    w: 280, h: 112, cd: 5, value: 12, load: 2, price: 6,
    desc: "基本5秒ごとに直近の相手UIによる実HP被害の非貫通分を50%復元（上限12）。履歴はページ共有で1回だけ・5秒で失効。0被害や貫通だけの被弾でも上書きされる。サーバ損失・自己広告離脱・管理設備攻撃は記録しない。空の履歴では発動しない。",
    added: true, status: "experimental", minW: 224, minH: 96, maxW: 560, maxH: 224,
  },
  gov_rate_limit: {
    id: "gov_rate_limit", name: "アクセス整理（429）", faction: "gov", kind: "passive",
    tags: ["document", "control", "rate-limit"], layout: "banner",
    w: 280, h: 88, cd: 0, value: 4, load: 3, price: 7,
    desc: "連続アクセスを整理し、受ける1発の非貫通部分を最大4軽減。ページ全体で最大24を蓄積し、毎秒24補充。重複しても枠は増えない。貫通部分や過負荷は止めない。",
    added: true, status: "experimental", minW: 224, minH: 72, maxW: 560, maxH: 132,
  },
};
