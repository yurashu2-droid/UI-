/** Original, inert Q&A page chrome. All usable controls are canonical source parts. */
export function qandaHeader():string {
  return '<div class="qanda-word"><i aria-hidden="true"><b></b><b></b><b></b></i><span>stack.garden<small>Stack Overflow風 · 非公式UIモチーフ</small></span></div><nav><span>製品</span><span>コミュニティ</span></nav><div class="qanda-search">⌕　質問を探す</div><span class="qanda-local">架空のQ&Aページ</span>';
}
export function qandaDecor(kind:string):string {
  switch(kind){
    case 'qanda-rail':return '<nav class="qanda-rail"><span>⌂　ホーム</span><b>▤　質問</b><span>◇　タグ</span><span>♧　ユーザー</span><span>▣　コレクション</span><hr><small>COLLECTIVES</small><p>小さなWeb工房</p><p>ページのつなぎ方</p><aside>違う時代のUIにも、<br>それぞれの働きがある。</aside></nav>';
    case 'qanda-title':return '<header class="qanda-title"><div><h1>接続したUIが動かないのはなぜ？</h1><span>質問日 <b>今日</b>　更新 <b>3分前</b>　閲覧 <b>128回</b></span></div><em>質問する</em></header>';
    case 'qanda-answer-title':return '<div class="qanda-answer-title"><b>1件の回答</b><span>並べ替え：スコア ▾</span></div>';
    case 'qanda-accepted':return '<div class="qanda-accepted"><b aria-label="採用された回答（表示のみ）">✓</b><small>採用<br>表示のみ</small></div>';
    case 'qanda-related-title':return '<h3 class="qanda-related-title">関連する質問</h3>';
    case 'qanda-blog':return '<aside class="qanda-blog"><h3>小さなWebのメモ</h3><p>✎　ページの見た目と、<br>　　働きはつながっている。</p><h3>コミュニティから</h3><p>◇　元の操作の形を残して、<br>　　違う部品を組み合わせる。</p></aside>';
    case 'qanda-author':return '<aside class="qanda-author"><small>架空の回答者</small><div><i aria-hidden="true">m</i><span><b>mado_builder</b><small>小さなページの作り手</small></span></div><p>採用やスコアは表示用です。<br>実際の投票・投稿は行いません。</p></aside>';
    case 'qanda-note':return '<small class="qanda-note">出典は差分の通常発動を待ちます。採用の印自体に追加効果はありません。</small>';
    default:return '';
  }
}
