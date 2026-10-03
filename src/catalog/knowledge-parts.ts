import type { PartDefinition } from "../types.js";

type Row = [string, string, "wiki" | "forge", string, string, string, number, number, number, number, number, number, string, Partial<PartDefinition>?];
const rows: Row[] = [
  ["wk_article", "百科事典の記事", "wiki", "attack", "text document article", "article", 500, 140, 4.4, 10, 3, 5,
    "4.4秒ごとに10ダメージ。まとまった文章を届ける記事本文。文字強化と書類の加速を受けるが、広い読み物の面積が必要。", { minH: 108 }],
  ["wk_reference", "出典・脚注", "wiki", "echo", "text document reference", "references", 500, 52, 6.5, 0.35, 1, 4,
    "6.5秒ごとに近接する攻撃の最後の通常発動を35%で参照。軽いが再発動は弱く遅い。原本の発動前は待ち、収益・成長は連鎖させない。", { minH: 48 }],
  ["wk_infobox", "基礎情報ボックス", "wiki", "shield", "text document container", "container", 232, 252, 5, 8, 2, 5,
    "5秒ごとにシールド8。基礎情報の枠に小さな文字UIを内包できる。内包そのものに隠れた加速や威力補正はない。",
    { minW: 200, minH: 180, container: true, padding: [84, 12, 12, 12] }],
  ["gh_diff", "変更差分", "forge", "attack", "text document code", "code-diff", 640, 172, 5, 22, 4, 7,
    "5秒ごとに22ダメージ。大きな差分をまとめて届ける。PDFより通常火力は高いが貫通はなく、広い面積とCPU4が必要。", { minW: 360, minH: 136 }],
  ["gh_commit", "コミット履歴", "forge", "echo", "text code history", "commit", 640, 44, 7, 0.5, 2, 5,
    "7秒ごとに近接する攻撃の最後の通常発動を50%で再適用。原本が必要で、収益・成長は連鎖させない。実際のリポジトリは操作しない。", { minH: 40 }],
  ["gh_checks", "チェック結果", "forge", "shield", "text code trust", "checks", 280, 128, 5.5, 10, 2, 5,
    "5.5秒ごとにシールド10。検証結果を表示して閲覧者を引き留める。ゲーム内の演出で、実際のビルドや外部チェックは実行しない。", { minW: 224, minH: 100 }],
  ["gh_transfer", "ZIPファイル転送", "forge", "attack", "text document download", "transfer", 416, 112, 8, 30, 3, 7,
    "8秒ごとに30ダメージ。大きな通常攻撃だが貫通はなく、初動が遅い。原本の通常転送後は既存の再発動UIで再利用できる。文字・書類強化を受けるが、PDFより広い場所を使う。実ファイルは転送しない。", { minW: 320, minH: 112 }],
];
export const KNOWLEDGE_PARTS: Record<string, PartDefinition> = Object.fromEntries(rows.map(
  ([id, name, faction, kind, tags, layout, w, h, cd, value, load, price, desc, extra = {}]) => [id, {
    id, name, faction, kind, tags: tags.split(" "), layout, w, h, cd, value, load, price, desc,
    added: true, status: "experimental", minW: 288, minH: h, maxW: 880, maxH: 360, ...extra,
  } satisfies PartDefinition],
));
