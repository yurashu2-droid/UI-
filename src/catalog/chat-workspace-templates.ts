import type { SiteTemplate } from "./types.js";

/** Chat chrome is fixed artwork; four existing native parts own all game behavior. */
export const CHAT_WORKSPACE_TEMPLATES: SiteTemplate[] = [{
  id: "site_slack",
  name: "Slack風（会話と復元のタイミング）",
  faction: "chatworkspace",
  pageName: "SIDECHANNEL / 小さなWebの会話",
  address: "archive://templates/chat-workspace",
  hp: 440, fee: 0, reward: 0, admin: [], status: "experimental",
  tip: "4部品・$20・CPU8。パンくずだけを左の変更履歴から右のPDF上へ動かすと、15%加速の対象が変わる。復元は直近の被害を読むため、速さだけでなく相手との発動時刻も重要。会話と入力欄は固定見本。",
  loot: ["tw_post", "go_history", "gov_pdf"],
  inspiredBy: "Slackのワークスペースとチャンネルのサイドバー、時系列の会話、個別メッセージを掘り下げるスレッドを参考にした架空の会話画面。右側の添付スレッドと左側の復元実験を並べる独自のゲーム教材で、Slackの機能や現在の標準画面の再現ではない。文章・名前・時刻は創作で、公式のコード・画像・ロゴ・アカウント情報は使わず、公式サービスとは無関係。",
  references: [
    "https://slack.com/help/articles/115000769927-Use-threads-to-organize-discussions",
    "https://slack.com/help/articles/212596808-Adjust-your-sidebar-preferences",
  ],
  counterplay: "パンくずを(208,316)から(648,228)へ移すと、変更履歴の15%加速を失いPDFが15%加速する。(208,552)へ離せば両方未接続。同じ4部品・面積98,208・CPU8のまま。HP440・双方CPU12・設備なし・通常combat-v4の固定24秒例では、5秒間隔の差分1つに対して初期127ダメージ/55復元、移動後145/0。差分の初撃2.5秒と加速なし履歴の時刻が一致し、次の履歴時刻には前の5秒記録が失効する限定例。相手の初回時計だけを0.75秒早める診断では両方55復元、0.75秒遅らせると55/44になる。8秒ZIPなら両方36復元、小さいリンク被害が差分のあとに続けば21/17.5。復元は非貫通の直近被害の半分・上限12で、同じ記録は1回だけ。PDFの1回18・50%貫通は移動で変わらない。両配置とも$17/CPU5の文字強化付き4リンクに両席で敗れる。シールド・収益・再発動はなく、チャンネルやスレッドに内包効果もない。投稿と履歴は試作UIを含むため、通常ショップの入手保証や最適な完成形ではない。外部への送信・同期・ファイル転送は行わない。",
  layout: [
    ["tw_post", 208, 112, 408, 108, null, "添付の見本を、会話の横で読み比べています。"],
    ["go_history", 208, 352, 288, 112, null, "復元のタイミングを観察"],
    ["gov_pdf", 648, 264, 288, 48, null, "会話のそばに置く資料.pdf"],
    ["gov_breadcrumb", 208, 316, 288, 28, null, "履歴と添付をつなぐ導線"],
  ],
  decor: [
    ["chat-workspace-rail", 16, 16, 168, 604],
    ["chat-channel-title", 208, 12, 408, 56],
    ["chat-thread-title", 648, 12, 288, 56],
    ["chat-day-divider", 208, 80, 408, 20],
    ["chat-thread-source", 648, 88, 288, 116],
    ["chat-recovery-caption", 208, 272, 408, 28],
    ["chat-attachment-caption", 648, 204, 288, 16],
    ["chat-history-note", 208, 480, 408, 52],
    ["chat-thread-note", 648, 332, 288, 144],
    ["chat-composer", 208, 592, 408, 64],
    ["chat-thread-composer", 648, 508, 288, 64],
    ["chat-outcome-note", 648, 592, 288, 72],
    ["chat-local-note", 16, 640, 168, 32],
  ],
}];
