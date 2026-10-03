import type {SiteTemplate} from './types.js';

export const QANDA_TEMPLATES:SiteTemplate[]=[{
  id:'site_stackoverflow',name:'Stack Overflow風（質問と採用された回答）',faction:'qanda',
  pageName:'stack.garden / UIのつなぎ方',address:'archive://templates/question-and-answer',
  hp:440,fee:0,reward:0,admin:['captcha'],status:'experimental',
  tip:'平面の質問・回答に、それぞれの投票を添える。出典が再現する攻撃は差分だけ。採用マークは表示のみで、罫線とお知らせが実際の防御・回復を受け持つ。',
  loot:['rd_vote','gh_diff','wk_reference'],
  inspiredBy:'Stack Overflowの単独質問、独立した投票列、採用された回答、タグ、関連質問欄を参考にした架空のQ&Aページ。公式サービスとは無関係。',
  references:['https://stackoverflow.com/help/why-vote','https://stackoverflow.com/help/accepted-answer','https://stackoverflow.com/help/formatting'],
  counterplay:'差分は大きな通常攻撃で、貫通は持たない。原本が覆われると出典も動きにくく、キャッシュ保護や収益変換もない。関連質問は本物のリンク3つで、空白による強化はページ内の先頭2つに限られる。',
  layout:[
    ['rd_vote',188,120,48,128,null,'質問'],['wk_article',248,120,440,108,null,'接続したUIが動かないのはなぜ？'],
    ['nc_tag',248,244,440,36,null,'ui-layout'],['ab_hr',188,296,500,8],
    ['rd_vote',188,328,48,128,null,'回答'],['gh_diff',248,328,440,172,null,'answer/connect-ui.ts'],
    ['wk_reference',248,508,440,52,null,'この修正の出典'],['gov_notice',248,572,440,56,null,'追記：本文と出典を隣り合わせにしました'],
    ['ab_link',728,160,208,32,null,'余白を残すリンクの配置'],['ab_link',728,200,208,32,null,'原本を待つ再発動のしくみ'],['ab_link',728,240,208,32,null,'小さなUIをつなぐには'],
  ],
  decor:[['qanda-rail',24,120,140,500],['qanda-title',188,8,748,88],['qanda-answer-title',188,306,500,20],['qanda-accepted',188,472,48,80],['qanda-related-title',728,120,208,24],['qanda-blog',728,312,208,164],['qanda-author',728,500,208,112],['qanda-note',248,640,688,24]],
}];
