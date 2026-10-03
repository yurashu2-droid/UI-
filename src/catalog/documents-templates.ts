import type { SiteTemplate } from './types.js';

export const DOCUMENT_TEMPLATES:SiteTemplate[]=[{
  id:'site_google_docs',name:'Google Docs風（共同編集と履歴）',faction:'documents',
  pageName:'draftroom / ページづくりのメモ',address:'archive://templates/collaborative-document',
  hp:440,fee:0,reward:0,admin:['backup'],status:'experimental',
  tip:'中央の本文・差分・PDFと、右の変更履歴。文字サイズと言語UIを本文へつなぎ、キャッシュ保護と被害の復元を別々に使う。',
  loot:['go_history','gh_diff','wk_article'],
  inspiredBy:'Google Docsの編集メニュー、文書キャンバス、共同編集のコメント、変更履歴サイドバーを参考にした架空の編集画面。公式サービスとは無関係。',
  references:['https://support.google.com/docs/answer/190843?hl=en'],
  counterplay:'変更履歴は直近の通常被害を限定的に戻すだけで、細かい連打や貫通には弱い。広い文書と確認UIへ面積・CPUを使い、収益を攻撃へ変換する仕組みは持たない。',
  layout:[
    ['gov_form',96,108,528,492,null,'共有ドキュメント'],
    ['gov_font',112,172,232,36],['go_translate',344,172,184,36],
    ['wk_article',112,220,496,140,null,'好きなWebを、ひとつのページへ'],
    ['gh_diff',112,376,496,136,null,'notes/page-layout.md'],
    ['gov_pdf',112,536,232,48,null,'ページづくりの資料.pdf'],['go_cache',356,536,252,44,null,'保存済み表示を使う'],
    ['go_history',648,108,288,112],['x_note',648,244,288,92,null,'修正メモ：違うサイトのUIも、元の操作を保ったまま組み合わせます。'],
    ['gh_checks',648,360,288,128],
  ],
  decor:[['docs-menu',24,0,912,36],['docs-title',96,52,528,40],['docs-side-title',648,52,288,40],['docs-outline',16,116,64,400],['docs-comments',648,512,288,128],['docs-save-note',96,624,528,24]],
}];
