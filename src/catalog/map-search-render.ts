/** All places and roads are fictional. No location, map service or route lookup. */
export function mapSearchHeader():string {
 return '<div class="map-word"><i aria-hidden="true">◇</i><span>まちさがし<small>Google Maps風 · 非公式UIモチーフ</small></span></div><nav><b>小庭の街</b><span>書店</span><span>喫茶</span><span>工房</span></nav><small class="map-local">架空の固定地図</small>';
}
export function mapSearchDecor(kind:string):string {
 const marker=/^map-marker-([abc])$/.exec(kind);
 if(marker)return `<span class="map-location-dot" aria-hidden="true">${marker[1].toUpperCase()}</span>`;
 switch(kind){
  case 'map-rail-heading':return '<div class="map-results-heading"><b>小庭で見つけた場所</b><small>3件 · 固定表示</small></div>';
  case 'map-result-a-meta':return '<small class="map-place-meta">A · 路地の書店 / 架空の場所</small>';
  case 'map-result-b-meta':return '<small class="map-place-meta">B · 橋の喫茶室 / 架空の場所</small>';
  case 'map-result-c-meta':return '<small class="map-place-meta">C · 庭の工房 / 架空の場所</small>';
  case 'map-rail-note':return '<small class="map-rail-note">検索はページ内のプレビューです。<br>位置情報の取得や経路検索は行いません。</small>';
  case 'map-area-title':return '<div class="map-area-title"><b>小庭の街</b><span>水辺と路地の、ちいさな見取り図</span></div>';
  case 'map-place-a-note':return '<div class="map-place-note"><b>A / 路地の区画</b><small>本と紙のある場所</small></div>';
  case 'map-place-b-note':return '<div class="map-place-note"><b>B / 橋のたもと</b><small>水辺の休憩室</small></div>';
  case 'map-place-c-note':return '<div class="map-place-note"><b>C / 庭の南側</b><small>小さな道具の工房</small></div>';
  case 'map-park':return '<div class="map-park-label"><span aria-hidden="true">♧</span><b>こかげ公園</b><small>架空の緑地</small></div>';
  case 'map-river':return '<span class="map-river-label">小庭川</span>';
  case 'map-street':return '<span class="map-street-label">路地通り</span>';
  case 'map-legend':return '<aside class="map-legend"><b>架空の固定図</b><span>縮尺なし · 道路やピンは演出用</span><small>離れたリンクに追加防御はありません</small></aside>';
  default:return '';
 }
}
