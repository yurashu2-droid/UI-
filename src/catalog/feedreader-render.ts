/** Original fixed feed-reader chrome. No RSS, subscription or unread-state operations. */
export function feedreaderHeader():string {
  return '<div class="reader-word"><i aria-hidden="true">≋</i><span>feedroom<small>Google Reader風 · 非公式UIモチーフ</small></span></div><nav><b>リーダー</b><span>ライブラリ</span><span>設定</span></nav><div class="reader-account">ローカルの架空ユーザー <span>▾</span></div>';
}
export function feedreaderDecor(kind:string):string {
  switch(kind){
    case 'reader-title':return '<header class="reader-title"><b>小さなWebの購読箱</b><span>読みたいページを、ひとつずつ。</span><small>固定表示のデモ</small></header>';
    case 'reader-subscription-heading':return '<h3 class="reader-subscription-heading"><span>▾</span> 登録フィード <small>3</small></h3>';
    case 'reader-view-heading':return '<div class="reader-view-heading"><b>すべてのアイテム</b><span>展開表示（固定）</span><small>小さなWeb日報 · 今日</small></div>';
    case 'reader-second-meta':return '<div class="reader-second-meta"><b>道具箱の更新</b><span>今日 · 変更の記録</span></div>';
    case 'reader-subscriptions':return '<aside class="reader-subscriptions"><h4>▾ フォルダ</h4><p>◇ 制作の記録 <small>4</small></p><p>◇ 読みもの <small>2</small></p><p>◇ 道具箱 <small>6</small></p><hr><h4>読み返す</h4><p>スターを付けた記事</p><p>元のページと出典</p><div>未読数は表示用です。<br>外部フィードやアカウントへ<br>接続しません。</div></aside>';
    case 'reader-disclaimer':return '<small class="reader-disclaimer">検索は近くのUIだけを参照します。本文と差分はそれぞれ別の原本です。外部への購読・共有や既読操作は行いません。</small>';
    default:return '';
  }
}
