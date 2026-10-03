/** Fictional visual-discovery chrome. All shapes, shelf names and chips are fixed. */
export function pinfieldHeader(): string {
  return '<div class="pinfield-word"><i aria-hidden="true"><span></span><span></span><span></span></i><span>PINFIELD<small>Pinterest風 · 非公式UIモチーフ</small></span></div><span class="pinfield-header-context">ひらめきを、棚に並べる。</span><span class="pinfield-header-local">架空の発見ボード · 固定の見本</span>';
}

export function pinfieldDecor(kind: string): string {
  switch (kind) {
    case "pinfield-search-note": return '<p class="pinfield-search-note">検索と動画は標準UIのローカルプレビュー。外部の検索結果は取得しません。</p>';
    case "pinfield-search-seat": return '<p class="pinfield-search-seat">② CCの移動先：上の (736,24)</p>';
    case "pinfield-board-heading": return '<header class="pinfield-board-heading"><div><h1>ひらめきの棚</h1><p>高さの違うアイデアを、三列に。</p></div><div class="pinfield-chips"><span class="pinfield-chip-label">固定のテーマ</span><span class="pinfield-chip">紙と余白</span><span class="pinfield-chip">窓辺の色</span><span class="pinfield-chip">葉のかたち</span></div></header>';
    case "pinfield-column-title": return '<h2 class="pinfield-column-title">動くアイデア <small>下は標準の動画UI</small></h2>';
    case "pinfield-paper-card": return '<figure class="pinfield-paper-card"><div class="pinfield-art pinfield-paper-scene" aria-hidden="true"><i class="pinfield-paper-sheet pinfield-paper-back"></i><i class="pinfield-paper-sheet pinfield-paper-front"></i><i class="pinfield-paper-ring"></i></div><figcaption class="pinfield-card-label"><b>折り目から、ひらく。</b><small>紙と余白 / 固定の棚名・CSS図形</small></figcaption></figure>';
    case "pinfield-window-card": return '<figure class="pinfield-window-card"><div class="pinfield-art pinfield-window-scene" aria-hidden="true"><i class="pinfield-window-frame"></i><i class="pinfield-window-light"></i><i class="pinfield-stem"></i><i class="pinfield-leaf pinfield-leaf-one"></i><i class="pinfield-leaf pinfield-leaf-two"></i><i class="pinfield-leaf pinfield-leaf-three"></i><i class="pinfield-pot"></i></div><figcaption class="pinfield-card-label"><b>窓辺に、ひと呼吸。</b><small>葉のかたち / 固定の棚名・CSS図形</small></figcaption></figure>';
    case "pinfield-video-note": return '<p class="pinfield-video-note"><b>① 動画の下 / 初期</b><br>25%がシールドを貫通</p>';
    case "pinfield-video-detail": return '<p class="pinfield-video-detail">動かすのは、動画の下のCCだけ。<br>4 UI · $20 · CPU10 · 占有103,104px²</p>';
    case "pinfield-link-note": return '<p class="pinfield-link-note"><b>紙と窓辺 / 固定の棚名</b><br>上の青リンクは標準UIです。<br>棚の図に戦闘効果や内包機能はありません。</p>';
    case "pinfield-detached-title": return '<h2 class="pinfield-detached-title">接続しない比較席 <small>ゲーム用の配置目印</small></h2>';
    case "pinfield-detached-note": return '<p class="pinfield-detached-note">③ CCだけをここへ<br>(648,480) / 未接続</p>';
    case "pinfield-paper-strip": return '<figure class="pinfield-paper-strip"><div class="pinfield-paper-swatches" aria-hidden="true"><i></i><i></i><i></i></div><figcaption class="pinfield-strip-label"><b>色を、少しだけ。</b><small>固定の紙の見本</small></figcaption></figure>';
    case "pinfield-window-strip": return '<figure class="pinfield-window-strip"><div class="pinfield-window-study" aria-hidden="true"><i></i><i></i></div><figcaption class="pinfield-strip-label"><b>午後のかたち。</b><small>固定の窓の見本</small></figcaption></figure>';
    case "pinfield-offset-note": return '<p class="pinfield-offset-note">上のCCをy=26へずらすと、<br>近いままフォームを失い検索は10。<br>並びと近さの違いを比べます。</p>';
    case "pinfield-comparison": return '<section class="pinfield-comparison"><p>CCだけを(736,24)へ：動画の25%貫通 → 検索 (8+2)×1.3＝13。異種UIの接続はゲーム内の仕組みです。</p><p>通常combat-v4・双方HP10,000/CPU12・設備なし・24秒：空の相手 227→262、通知ベル8個 33→15。</p><p>ベル8個は$32/CPU8の測定用（同額ではありません）。6個なら35→61。相手・開始時刻・観測時間で変わります。</p><p>CCは字幕のまま、検索送信ではありません。棚・図・チップは固定見本。保存・投稿・推薦や外部への通信はありません。</p></section>';
    default: return "";
  }
}
