export function discoveryHeader(theme: string): string {
  if (theme === 'portal') return '<div class="portal-word">まどぐち!<small>Yahoo! JAPAN風 · 非公式UIモチーフ</small></div><nav>毎日を、ここから。<span>サービス一覧　│　表示設定</span></nav>';
  if (theme === 'storefront') return '<div class="store-word"><i aria-hidden="true">◇</i><span>playfoundry<small>Steam風 · 非公式UIモチーフ</small></span></div><nav><b>ストア</b><span>コミュニティ</span><span>サポート</span></nav><span class="store-local">LOCAL DEMO</span>';
  return '';
}

export function discoveryDecor(kind: string): string {
  switch (kind) {
    case 'portal-services': return `<nav class="portal-services"><h3>主なサービス</h3>${['ニュース','天気・防災','スポーツ','メール','乗換・地図','ショッピング','オークション','動画','ゲーム','知恵の広場'].map((name,i) => `<span><i>${['▤','☀','●','✉','▥','◇','♧','▶','▦','?'][i]}</i>${name}</span>`).join('')}<small>すべてのサービスを見る ›</small></nav>`;
    case 'portal-news': return '<div class="portal-news-tabs"><b>主要</b><span>国内</span><span>経済</span><span>IT</span><small>模擬ニュース</small></div>';
    case 'portal-weather': return '<aside class="portal-weather"><h3>今日の天気 <small>架空の町</small></h3><div><i aria-hidden="true">☀</i><span><b>24°</b><small>晴れ　降水 10%</small></span></div><p>明日　☁ 22°　│　週間予報 ›</p><small>表示用の例・実際の予報ではありません</small></aside>';
    case 'portal-account': return '<aside class="portal-account"><h3>こんにちは、ページをつくる人。</h3><b>架空のアカウントメニュー</b><div>✉ メール　　▣ ポイント</div><small>ログインや個人情報の入力はありません</small></aside>';
    case 'portal-shopping': return '<aside class="portal-shopping"><h3>見つけよう、小さな道具</h3><div class="portal-shopping-art" aria-hidden="true"><i>UI</i><b>◇</b></div><p>ページづくりを、ちょっと楽しく。</p><small>ピックアップ　│　新しい発見</small></aside>';
    case 'portal-footnote': return '<small class="portal-footnote">利用案内　プライバシー<br>このページはUIの架空再構成です。<br>ニュース・天気・残高は実情報ではありません。</small>';
    case 'store-title': return '<div class="store-title"><small>すべてのゲーム › 小さな庭づくり</small><h1>WINDOW GARDEN</h1><span>架空の商品ページ · 購入なし</span></div>';
    case 'store-description': return '<aside class="store-description"><div class="store-key-art" aria-hidden="true"><i></i><i></i><i></i><strong>WINDOW<br>GARDEN</strong></div><p>窓を並べて、小さなインターネットの庭を育てよう。</p><dl><dt>最近のレビュー：</dt><dd>好評（架空）</dd><dt>開発：</dt><dd>Small Window Studio</dd></dl><div class="store-tags"><span>制作</span><span>パズル</span><span>のんびり</span></div></aside>';
    case 'store-gallery': return '<div class="store-gallery"><i>01</i><i>02</i><i>03</i><small>架空の画面サンプル</small></div>';
    case 'store-languages': return '<div class="store-languages"><b>インターフェース</b><span>✓ 日本語　✓ English</span><small>実在の商品の対応情報ではありません</small></div>';
    default: return '';
  }
}
