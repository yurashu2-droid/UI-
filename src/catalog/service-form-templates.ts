import type {SiteTemplate} from './types.js';
/** Independently reviewed existing-parts teaching template; no new combat family. */
export const SERVICE_FORM_TEMPLATES:SiteTemplate[]=[{
 id:'site_govuk',name:'GOV.UK風（確認・送信の統合）',faction:'serviceform',
 pageName:'PUBLIC DESK / 小さな展示室の利用確認',address:'archive://templates/public-service-form',
 hp:440,fee:0,reward:0,admin:[],status:'experimental',
 tip:'フォーム内の確認チェックと送信を合成する。チェックの防御を失う代わりに、送信は30%貫通と単独でも得られる収益へ変化。6部品・$29・CPU12の配置教材。',
 loot:['gov_check','gov_submit','gov_form'],
 inspiredBy:'GOV.UKの黒いサービスヘッダー、広い左本文、入力内容の確認一覧と補助案内を参考にした架空の公共窓口。標準の申請UIを組み合わせたゲーム上の配置例で、公式サービスとは無関係。',
 references:['https://design-system.service.gov.uk/patterns/check-answers/','https://design-system.service.gov.uk/components/button/','https://design-system.service.gov.uk/patterns/question-pages/'],
 counterplay:'合成後も親フォームの占有面積は残る。親を外すと子も手持ちへ戻るため、統合ボタンを再配置して初めてCPU8になる。その代わりフォームのシールドと20%加速を失う。パンくずを近くへ動かせば、別に15%の加速を足せる。収益の変換先・再発動・キャッシュはない。これは開いた組み替えの教材で、固定の最適ビルドではない。',
 layout:[
  ['gov_breadcrumb',24,8,600,28],['gov_form',24,272,600,212],
  ['gov_check',40,336,232,32,null,'表示内容を確認しました'],['gov_submit',40,392,184,40,null,'確認して進む'],
  ['gov_pdf',672,336,264,48,null,'利用案内の見本.pdf'],['gov_notice',672,400,264,56,null,'架空の利用案内を確認できます'],
 ],
 decor:[['service-title',24,56,600,84],['service-summary',24,156,600,96],['service-help',672,56,264,196],['service-guide-title',672,272,264,44],['service-fusion-note',24,508,600,72],['service-parent-note',24,596,600,72],['service-local-note',672,500,264,160]],
}];
