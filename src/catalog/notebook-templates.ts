import type { SiteTemplate } from "./types.js";

/** Notebook blocks are original fixed artwork; only four canonical parts are live. */
export const NOTEBOOK_TEMPLATES: SiteTemplate[] = [{
  id: "site_notion",
  name: "Notion風（ノートと余白の配分）",
  faction: "notebook",
  pageName: "LEAFNOTE / 小さなWebのノート",
  address: "archive://templates/notebook",
  hp: 440, fee: 0, reward: 0, admin: [], status: "experimental",
  tip: "4部品・$14・CPU4。左の2本目のリンクだけを(24,240)から(24,520)へ移すと、縦ナビの15%加速を失う代わりに、ページ先頭2本の余白強調が本文のリンクへ移る。ノートの文章・目次は固定見本。",
  loot: ["ab_link", "gov_font"],
  inspiredBy: "Notionの入れ子のページ一覧、wikiのHomeに置く見出しと案内ブロック、段組みと目次を参考にした架空のノート。ページリンクの順序と実際のゲーム内配置を比べる独自の教材で、現在のNotion画面や機能の再現ではない。文章・題名・図形は創作。公式コード・ロゴ・画像・アカウント情報を使わず、公式サービスとは無関係。",
  references: [
    "https://www.notion.com/help/navigate-with-the-sidebar",
    "https://www.notion.com/help/wikis-and-verified-pages",
    "https://www.notion.com/help/columns-headings-and-dividers",
  ],
  counterplay: "同じ4所持品・$14・CPU4・占有28,832px²。初期は左2本が縦ナビで15%加速し、レトロ3個の15%加速も受ける。2本目だけを(24,520)へ移すと縦ナビは解消し、余白の+3はページ全体の先頭2本として左上と本文に付く。文字強化済み本文は6→10.5、移したリンクは7→4。余白率・文字強化・レトロ加速は同じ。双方HP10,000・CPU12・設備なし・通常combat-v4の0.05秒刻み24秒では、空の相手へ342→322.5ダメージ。相手に既存429を1つ置くと138→142.5で、元の火力から大きく減る。6.7秒では両方38、12秒では70→76で、開始位相や観測の終点にも依存する限定例。固定24秒でも全攻撃の初回だけ0.25秒遅らせる診断では132→142.5になる。どちらもシールド・回復・貫通・再発動・収益なし。HP440では、全3リンクを文字強化につなぐ同額$14/CPU4・占有25,088px²の合法な構成へ両席で敗れる。429への勝利・最適な完成形・通常ショップでの入手経路を示すものではない。背景のノート・目次・下段の棚は固定表示で、内包・共有・同期・外部ページ移動は行わない。",
  layout: [
    ["ab_link", 24, 200, 160, 32, null, "小さなWebの入口"],
    ["ab_link", 24, 240, 160, 32, null, "つくった日の記録"],
    ["ab_link", 248, 360, 320, 32, null, "余白のあるページをつくる"],
    ["gov_font", 248, 312, 232, 36],
  ],
  decor: [
    ["notebook-rail-top", 16, 16, 176, 172],
    ["notebook-rail-note", 24, 288, 160, 128],
    ["notebook-shelf-caption", 24, 460, 160, 48],
    ["notebook-shelf-note", 24, 564, 160, 44],
    ["notebook-breadcrumb", 248, 12, 664, 24],
    ["notebook-title", 248, 60, 664, 104],
    ["notebook-callout", 248, 188, 664, 88],
    ["notebook-section", 248, 288, 360, 20],
    ["notebook-reading-note", 248, 412, 360, 128],
    ["notebook-index", 656, 312, 256, 224],
    ["notebook-comparison", 248, 564, 664, 84],
    ["notebook-local-note", 16, 628, 176, 44],
  ],
}];
