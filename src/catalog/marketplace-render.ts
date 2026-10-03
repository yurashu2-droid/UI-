/** Fictional shopping chrome. No store account, point balance, real purchase or payment. */
export function marketplaceHeader():string {
  return '<div class="mall-word"><i aria-hidden="true">こ</i><span>こみち市場<small>楽天市場風 · 非公式UIモチーフ</small></span></div><nav><b>お買いもの</b><span>ランキング</span><span>ショップ</span></nav><span class="mall-header-note">架空の商品とページの展示</span>';
}
export function marketplaceDecor(kind:string):string {
  switch(kind){
    case 'mall-brand':return '<div class="mall-brand"><b>小さなWebの<br>道具市</b><span>見つける、つなぐ。</span></div>';
    case 'mall-campaign':return '<section class="mall-campaign"><span>WEB PARTS MARKET</span><div><h1>道具と、作り手に出会う。</h1><p>クーポンは買い物へ。セールは、このページの応援へ。</p></div><b>2つの<br>使い道</b></section>';
    case 'mall-category-heading':return '<div class="mall-category-heading"><strong>ジャンルから探す</strong><small>好きなものを、少しずつ</small></div>';
    case 'mall-category-list':return '<nav class="mall-category-list"><b>こみちの棚</b><p>文具と小さな道具 <span>›</span></p><p>読みもの <span>›</span></p><p>暮らしの箱 <span>›</span></p><p>手づくりの時間 <span>›</span></p><p>作り手のページ <span>›</span></p><aside>今日のひとこと<br><strong>道具を選ぶ楽しみも、<br>誰かを応援する気持ちも。</strong></aside></nav>';
    case 'mall-ranking':return '<section class="mall-ranking"><b>こみちの人気もの<small>表示用ランキング</small></b><span><i>1</i>小さな道具箱</span><span><i>2</i>ページ工房セット</span><span><i>3</i>紙とリンクの栞</span></section>';
    case 'mall-disclaimer':return '<small class="mall-disclaimer">商品・価格・順位は架空です。<br>実際の購入や決済、<br>ポイント発行は行いません。<br>応援は合成UIの展示です。</small>';
    case 'mall-support-note':return '<div class="mall-support-note"><b>この列の収益先：応援シールド</b><small>満タンでは最大$6を蓄えて待ちます。</small></div>';
    default:return '';
  }
}
