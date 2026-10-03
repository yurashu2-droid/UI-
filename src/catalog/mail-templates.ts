import type { SiteTemplate } from "./types.js";

/** The correspondence is fictional display chrome; only these seven parts fight. */
export const MAIL_TEMPLATES: SiteTemplate[] = [{
  id: "site_gmail",
  name: "Gmail風（受信一覧と閲覧ペイン）",
  faction: "mailroom",
  pageName: "POSTROOM / 小さなWebの便り",
  address: "archive://templates/mail-reading-pane",
  hp: 440, fee: 0, reward: 0, admin: [], status: "experimental",
  tip: "7部品・$29・CPU12。右の翻訳セレクトが記事を25%強化し、その通常発動を出典が35%で再現。翻訳だけを受信一覧の先頭リンクの上へ移すと、強化先が切り替わる。便りとラベルは固定見本。",
  loot: ["go_search", "go_translate", "wk_reference"],
  inspiredBy: "Gmailの左ラベル欄、送信者・件名・要約の一覧、右側の閲覧ペイン、会話のまとまりを参考にした架空の受信画面。原作のコード・文章・画像や個人のメールを使わず、既存UIを組み合わせたゲーム上の配置例。公式サービスとは無関係。",
  references: [
    "https://support.google.com/mail/answer/9499937?hl=en",
    "https://support.google.com/mail/answer/5900?hl=en",
  ],
  counterplay: "翻訳セレクトを右の記事上から左の先頭件名リンク上へ移すと、25%強化が速いリンクへ移る一方、記事とその35%再発動は弱くなる。翻訳はGoogle系の検索を強化しない。一覧の余白を詰めれば本物のナビ連結を作れるが、今の配置にはない。シールド・回復・収益・貫通はなく、送受信や会話ラベルに独自効果もない。記事と出典は試作UIで、通常ショップの入手例ではない。",
  layout: [
    ["go_search", 216, 20, 704, 44, null, "小さなWebの便り"],
    ["ab_link", 216, 200, 328, 32, null, "小さなWebの資料を共有します"],
    ["ab_link", 216, 296, 328, 32, null, "余白のあるページができました"],
    ["ab_link", 216, 392, 328, 32, null, "リンク集に新しい入口を追加"],
    ["go_translate", 592, 152, 224, 40],
    ["wk_article", 592, 200, 344, 164, null, "同封ノート：ウェブ部品"],
    ["wk_reference", 592, 380, 344, 52, null, "同封ノートの出典を読む"],
  ],
  decor: [
    ["mail-folders", 16, 20, 168, 388],
    ["mail-list-toolbar", 216, 80, 328, 32],
    ["mail-reading-heading", 592, 80, 344, 28],
    ["mail-sender", 592, 116, 344, 28],
    ["mail-row-one-meta", 216, 178, 328, 18],
    ["mail-row-one-snippet", 216, 240, 328, 32],
    ["mail-row-two-meta", 216, 274, 328, 18],
    ["mail-row-two-snippet", 216, 336, 328, 32],
    ["mail-row-three-meta", 216, 370, 328, 18],
    ["mail-row-three-snippet", 216, 432, 328, 32],
    ["mail-thread-tail", 592, 456, 344, 64],
    ["mail-list-note", 216, 488, 328, 56],
    ["mail-local-note", 16, 448, 168, 104],
    ["mail-placement-lesson", 216, 568, 720, 84],
  ],
}];
