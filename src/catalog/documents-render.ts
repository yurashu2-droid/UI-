export function documentsHeader():string {
  return '<div class="documents-word"><i aria-hidden="true">▤</i><span>draftroom<small>Google Docs風 · 非公式UIモチーフ</small></span></div><div class="documents-file"><b>ページづくりのメモ</b><small>架空のドキュメント · ローカル表示</small></div><div class="documents-presence"><span>m</span><span>p</span></div><span class="documents-share">共有（表示用）</span>';
}
export function documentsDecor(kind:string):string {
  switch(kind){
    case 'docs-menu':return '<nav class="documents-menu"><span>ファイル</span><span>編集</span><span>表示</span><span>挿入</span><span>形式</span><span>ツール</span><span>拡張機能</span><span>ヘルプ</span><i></i><small>表示モード ▾</small></nav>';
    case 'docs-title':return '<div class="documents-title"><b>ページづくりのメモ</b><span>100%　│　A4　│　編集のサンプル</span></div>';
    case 'docs-side-title':return '<div class="documents-side-title"><b>変更と確認</b><span>履歴はページ全体で共有</span></div>';
    case 'docs-outline':return '<aside class="documents-outline"><b>概要</b><div><i></i><i></i><i></i><small>1</small></div><div><i></i><i></i><small>2</small></div><span>▤</span></aside>';
    case 'docs-comments':return '<aside class="documents-comments"><header><i>p</i><b>page_builder</b><small>架空のコメント</small></header><p>差分を確認しました。<br>本文と保存版を、別々に残しておきましょう。</p><footer><span>✓ 確認のサンプル</span><small>返信や送信は行いません</small></footer></aside>';
    case 'docs-save-note':return '<small class="documents-save-note">文書・コメントは架空の表示です。実際のクラウド文書やアカウントは変更しません。</small>';
    default:return '';
  }
}
