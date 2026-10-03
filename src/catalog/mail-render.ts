/** Original, fixed correspondence: no mailbox, account, or mail action exists here. */
export function mailHeader(): string {
  return '<div class="mail-word"><i aria-hidden="true">P</i><span>POSTROOM<small>Gmail風 · 非公式UIモチーフ</small></span></div><span class="mail-header-caption">小さなWebの便り</span><span class="mail-account">架空のローカル受信箱 <i aria-hidden="true">m</i></span>';
}

function sender(name: string, time: string, count: string): string {
  return `<div class="mail-row-meta"><b>${name}</b><span>${count}</span><time>${time}</time></div>`;
}

export function mailDecor(kind: string): string {
  switch (kind) {
    case "mail-folders": return '<aside class="mail-folders"><div class="mail-local-badge"><i aria-hidden="true">✉</i><b>LOCAL MAIL</b></div><h2>受信トレイ <span>3</span></h2><ul><li>スター付き</li><li>保管した便り</li><li>下書きの見本</li></ul><h3>ラベル <small>固定表示</small></h3><p><i class="mail-label-sage" aria-hidden="true"></i>ページづくり</p><p><i class="mail-label-sand" aria-hidden="true"></i>読みもの</p><p><i class="mail-label-lilac" aria-hidden="true"></i>小さな更新</p></aside>';
    case "mail-list-toolbar": return '<div class="mail-list-toolbar"><h1>受信トレイ</h1><span>3件の固定見本</span></div>';
    case "mail-reading-heading": return '<header class="mail-reading-heading"><b>資料が届いた日の会話</b><span>閲覧ペイン</span></header>';
    case "mail-sender": return '<div class="mail-sender"><i aria-hidden="true">s</i><span><b>しおり</b> から あなたへ<small>架空の便り · 同封ノートを表示</small></span><time>09:12</time></div>';
    case "mail-row-one-meta": return sender("しおり", "09:12", "会話 2");
    case "mail-row-one-snippet": return '<p class="mail-row-snippet">ページをつなぐ短い読みものを添えました。<br><span class="mail-label-sage">読みもの</span> 右の閲覧ペインに固定表示</p>';
    case "mail-row-two-meta": return sender("まどの制作室", "昨日", "会話 1");
    case "mail-row-two-snippet": return '<p class="mail-row-snippet">大きな見出しの横に、小さな入口をひとつ。<br><span class="mail-label-sand">ページづくり</span> 余白を残した制作メモ</p>';
    case "mail-row-three-meta": return sender("リンクの庭", "10月1日", "会話 1");
    case "mail-row-three-snippet": return '<p class="mail-row-snippet">古いページから、いまのページへつなぐ。<br><span class="mail-label-lilac">小さな更新</span> 入口をひとつ追加しました</p>';
    case "mail-thread-tail": return '<div class="mail-thread-tail"><i aria-hidden="true">m</i><div><b>あなた <small>09:18 · 返信の見本</small></b><p>ありがとう。ノートの出典も読んでみます。</p><span>この会話は固定の創作表示です</span></div></div>';
    case "mail-list-note": return '<p class="mail-list-note">件名リンクと検索はページ内プレビュー。<br>一覧・日時・会話件数は固定表示です。<br>左上の空き場所へ翻訳セレクトを動かせます。</p>';
    case "mail-local-note": return '<p class="mail-local-note"><b>架空のメール画面</b><br>実メールの取得・送受信・同期は<br>行いません。検索は一覧を絞らず、<br>言語選択は翻訳先の表示見本です。<br>人物も便りも、このページだけの創作。</p>';
    case "mail-placement-lesson": return '<section class="mail-placement-lesson"><b>翻訳を、どちらの文章につなぐ？</b><span>7 UI / $29 / CPU 12</span><p>右では記事と、その最後の通常発動を使う出典を強化。翻訳だけを左上の空き場所へ移すと、先頭の件名リンクを強化。<br>一覧の行間・会話ラベル・背景の区切りには独自の効果がなく、本当の接続は部品の距離で決まります。</p></section>';
    default: return "";
  }
}
