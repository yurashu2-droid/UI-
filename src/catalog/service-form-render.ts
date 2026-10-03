/** Original inert public-service chrome. Native controls keep their canonical behavior. */
export function serviceFormHeader():string {
 return '<div class="service-word">PUBLIC DESK<small>GOV.UK風 · 非公式UIモチーフ</small></div><span class="service-name">小さな展示室の利用確認</span><span class="service-local">ローカルの架空窓口</span>';
}
export function serviceFormDecor(kind:string):string {
 switch(kind){
  case 'service-title':return '<header class="service-title"><span>小さな展示室の利用確認</span><h1>内容を確認して、次へ進む</h1><p>この一覧はゲーム用の固定表示です。</p></header>';
  case 'service-summary':return '<dl class="service-summary"><div><dt>場所</dt><dd>窓辺の展示室（架空）</dd><dd class="service-summary-state">表示のみ</dd></div><div><dt>使いみち</dt><dd>小さなWeb作品の展示</dd><dd class="service-summary-state">表示のみ</dd></div><div><dt>確認事項</dt><dd>この画面から申請は送信されません</dd><dd class="service-summary-state">見本</dd></div></dl>';
  case 'service-help':return '<aside class="service-help"><h2>確認から、ひとつの操作へ</h2><p>左のチェックと送信は、同じフォームに入った本物のゲーム部品です。</p><p>合成すると送信ボタンの位置を保ち、確認欄の場所が空きます。</p><small>一覧の文字や右の案内には、<br>追加の戦闘効果はありません。</small></aside>';
  case 'service-guide-title':return '<h2 class="service-guide-title">利用案内とお知らせ</h2>';
  case 'service-fusion-note':return '<section class="service-note"><b>1　確認と送信を合成する</b><p>チェックのシールドを手放し、30%貫通とフォーム外でも得られる収益へ。<br>材料込み$29は変わらず、CPU12 → 11。親フォームの占有面積は変わりません。</p></section>';
  case 'service-parent-note':return '<section class="service-note"><b>2　親を手持ちへ戻し、統合ボタンだけ再配置する</b><p>親と子は一緒に戻ります。統合ボタンを出し直すと盤面CPU8。<br>フォームの防御と20%加速を失います。外した$5のフォームも手持ちに残ります。</p></section>';
  case 'service-local-note':return '<aside class="service-local-note"><b>デモの窓口です</b><p>外部への申請・保存・個人情報の送信は行いません。<br>表示は架空の場所と用途です。</p><p>ボタンはローカルのプレビュー。<br>ゲーム内の収益は、実際のお金ではありません。</p><small>政府・自治体のサービスではありません。</small></aside>';
  default:return '';
 }
}
