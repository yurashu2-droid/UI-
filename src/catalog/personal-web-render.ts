/** A present-day fictional personal page; no copied graphics, ring navigation or mail. */
export function personalWebHeader():string {
 return '<div class="personal-word"><span aria-hidden="true">☆</span><b>ほしのアトリエ</b><small>GeoCities風 · 非公式UIモチーフ</small></div><span class="personal-welcome">WELCOME TO MY HOME PAGE</span>';
}
export function personalWebDecor(kind:string):string {
 switch(kind){
  case 'personal-intro':return '<div class="personal-intro"><p>ようこそ、ほしのアトリエへ。</p><p>なぎ（架空の作り手）が、小さな作品と制作の記録を置いています。</p></div>';
  case 'personal-update':return '<div class="personal-update"><b>NEW!</b><span>2026.10.02　制作日記を更新しました。</span><small>日付は表示用</small></div>';
  case 'personal-bbs-note':return '<p class="personal-bbs-note">足あとを残していってください。書き込みはページ内の演出です。</p>';
  case 'personal-construction':return '<div class="personal-construction"><span>UNDER CONSTRUCTION</span><small>静止した飾りです</small></div>';
  case 'personal-webring':return '<div class="personal-webring"><b>星のアトリエ WEB RING</b><span>[ 前のページ | ランダム | 次のページ ]</span><small>表示のみ</small></div>';
  case 'personal-disclaimer':return '<small class="personal-disclaimer">架空のページです。公式サービスとは無関係です。外部への移動・メール送信は行いません。</small>';
  default:return '';
 }
}
