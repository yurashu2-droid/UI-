/** Fictional artist-store chrome. Artwork is original CSS geometry, with no audio/payment actions. */
export function musicShopHeader():string {
 return '<div class="musicshop-word"><i aria-hidden="true">▱</i><span>window sessions<small>Bandcamp風 · 非公式UIモチーフ</small></span></div><nav><b>music</b><span>作品について</span><span>表示のみ</span></nav><small class="musicshop-local">架空のアーティストストア</small>';
}
export function musicShopDecor(kind:string):string {
 switch(kind){
  case 'musicshop-banner':return '<div class="musicshop-banner"><b>window sessions</b><span>small sounds, open windows</span><i aria-hidden="true"></i></div>';
  case 'musicshop-album-title':return '<header class="musicshop-album-title"><h1>Maps Without Folds</h1><p>by <b>window sessions</b> <small>架空の作品</small></p></header>';
  case 'musicshop-track-list':return '<div class="musicshop-track-list"><span>01　Maps Without Folds</span><span>02　Margin Notes</span><small>曲目は表示のみ · 実音声なし</small></div>';
  case 'musicshop-purchase-label':return '<small class="musicshop-purchase-label">アルバム / ページ内のデモ</small>';
  case 'musicshop-cover':return '<div class="musicshop-cover" role="img" aria-label="窓と円盤を組み合わせた架空アルバムのオリジナル図形アート"><i class="sleeve-window"></i><i class="sleeve-disc"></i><i class="sleeve-horizon"></i><b>MAPS<br>WITHOUT<br>FOLDS</b><small>window sessions</small></div>';
  case 'musicshop-supporters':return '<div class="musicshop-supporters"><b>supported by</b><span aria-hidden="true">n</span><span aria-hidden="true">m</span><span aria-hidden="true">s</span><span aria-hidden="true">k</span><small>架空の支援者</small></div>';
  case 'musicshop-artist':return '<aside class="musicshop-artist"><h3>window sessions</h3><p>窓辺の風景を、小さな音のかたちへ。<br>ページのために作られた架空のユニットです。</p><small>録音・曲名・人物紹介は表示用です。</small></aside>';
  case 'musicshop-support-note':return '<aside class="musicshop-route-note"><b>初期配置：応援へ</b><p>クーポン収益はシールドに変換。<br>クーポンを右上の購入・カート間へ動かすと、この収益からの防御を失います。</p></aside>';
  case 'musicshop-cart-note':return '<aside class="musicshop-route-note"><b>初期カート攻撃は待機</b><p>3部品の収益ボーナスには参加。応援専用なら、安く軽い星評価でも維持できます。</p></aside>';
  case 'musicshop-credits':return '<section class="musicshop-credits"><b>about this demo</b><p>5部品・合成材料込み$31・CPU10。音楽の再生回数は動画広告や会員収益を増やしません。<br>応援上限では$6まで蓄積し、余剰をカートへ自動で振り替えません。</p><small>クレジット・曲目・ジャケットはこのページ用の創作です。</small></section>';
  case 'musicshop-local-note':return '<aside class="musicshop-local-note">音声の再生・購入・決済・<br>ダウンロードは行いません。<br>表示の円価格と戦闘内$は別です。<br><small>公式サービスとは無関係です。</small></aside>';
  default:return '';
 }
}
