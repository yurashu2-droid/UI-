/** Fixed fictional release chrome; real page parts keep their original controls. */
export function releasesDecor(kind:string):string {
  switch(kind){
    case 'release-nav':return '<nav class="repo-release-nav"><b>Releases</b><span>Tags</span><div>Find a release <small>表示用</small><i aria-hidden="true">⌕</i></div></nav>';
    case 'release-tag':return '<aside class="repo-release-tag"><strong>◇ v1.4.0</strong><time datetime="2026-10-02">Oct 2, 2026</time><div><i aria-hidden="true">m</i><b>mori</b></div><span>↔ Compare <small>表示用</small></span><p>架空の公開記録</p></aside>';
    case 'release-title':return '<header class="repo-release-title"><h1>UI Garden 1.4.0</h1><span>Latest</span></header>';
    case 'release-notes':return '<section class="repo-release-notes"><b>小さなUIを、元の姿のまま。</b><p>配布用ZIPと操作ガイドをまとめました。</p></section>';
    case 'release-assets-heading':return '<div class="repo-release-assets"><b>▾ Assets</b><span>2</span></div>';
    case 'release-cache-note':return '<aside class="repo-release-cache"><b>保存済み表示</b><p>保護は転送前から有効。<br>再利用は原本の通常転送を待ちます。</p></aside>';
    case 'release-pdf-heading':return '<h3 class="repo-release-pdf-heading">操作ガイド</h3>';
    case 'release-pdf-meta':return '<div class="repo-release-pdf-meta"><b>日本語ガイド</b><small>PDF形式・表示用のファイル情報</small></div>';
    case 'release-disclaimer':return '<aside class="repo-release-disclaimer">架空のリリースとファイルです。実ファイルの取得・送信は行いません。<br>同じGitHub系UIを3個置いても追加セット補正はありません。</aside>';
    case 'release-previous':return '<div class="repo-release-previous"><b>◇ v1.3.0</b><span>Previous release</span><time datetime="2026-09-18">Sep 18, 2026</time></div>';
    default:return '';
  }
}
