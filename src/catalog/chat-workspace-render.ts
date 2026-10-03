/** Original static chat-room artwork, not a connected messaging client. */
export function chatWorkspaceHeader(): string {
  return '<div class="chat-word"><i aria-hidden="true">≋</i><span>SIDECHANNEL<small>Slack風 · 非公式UIモチーフ</small></span></div><span class="chat-header-context">小さなWebの作業室</span><span class="chat-header-local">会話・チャンネルは固定見本</span>';
}

export function chatWorkspaceDecor(kind: string): string {
  switch (kind) {
    case "chat-workspace-rail": return '<aside class="chat-rail"><h2>小さなWebの作業室<span>架空のワークスペース</span></h2><p class="chat-rail-overview">会話の見本<br>あとで読む</p><h3>チャンネル <small>固定一覧</small></h3><ul><li># お知らせ</li><li class="chat-channel-active"># ページづくり</li><li># 資料の棚</li><li># ひとやすみ</li></ul><h3>メンバー <small>架空</small></h3><ul class="chat-members"><li><i aria-hidden="true">あ</i>あおい</li><li><i aria-hidden="true">な</i>なぎ</li><li><i aria-hidden="true">こ</i>こはる</li></ul><div class="chat-rail-cost"><h3>この配置の材料</h3><p>4 UI · $20 · CPU8</p><small>投稿と履歴は試作UI。<br>一覧や未読表示に効果はなく、<br>部屋は内包枠ではありません。</small></div><span class="chat-rail-foot">LOCAL UI STUDY / 26</span></aside>';
    case "chat-channel-title": return '<div class="chat-channel-title"><h2><span aria-hidden="true">#</span> ページづくり</h2><p>違う時刻に動く部品を、会話のそばで比べる</p></div>';
    case "chat-thread-title": return '<div class="chat-thread-title"><h2>スレッド</h2><p>添付の見本について · 固定表示</p></div>';
    case "chat-day-divider": return '<div class="chat-day-divider"><span>ある日の会話 / 架空の時刻</span></div>';
    case "chat-thread-source": return '<section class="chat-static-message"><div class="chat-message-meta"><i aria-hidden="true">な</i><b>なぎ</b><small>10:24 · 見本</small></div><p>資料を会話の横へ。<br>復元を待つか、添付を速めるか、<br>同じ導線を動かして比べよう。</p><span class="chat-reply-marker">1件の返信 · 固定の文章</span></section>';
    case "chat-recovery-caption": return '<div class="chat-section-caption"><b>履歴を読む実験</b><span>この下の導線は動かせるUI</span></div>';
    case "chat-attachment-caption": return '<p class="chat-slot-caption">移動先：x 648 / y 228 · PDFの上へ</p>';
    case "chat-history-note": return '<section class="chat-history-note"><b>履歴の隣：復元を15%加速</b><p>記録は直近の被害1つ・5秒で失効。<br>この下の x 208 / y 552 へ離せば、両方未接続。</p></section>';
    case "chat-thread-note": return '<section class="chat-thread-note"><div class="chat-message-meta"><i aria-hidden="true">こ</i><b>こはる</b><small>10:26 · 見本</small></div><p>パンくずだけを、添付の上へ。<br>PDFが15%速くなる代わりに、<br>左の履歴は通常の速度に戻る。</p><p>一撃18・50%貫通はそのまま。<br>復元量は、相手の時刻で変わる。</p></section>';
    case "chat-composer": return '<div class="chat-composer-mock"><span>ページづくりへのメッセージ欄</span><div><small>固定見本 · 入力・送信なし</small><b aria-hidden="true">＋　Aa　☺</b></div></div>';
    case "chat-thread-composer": return '<div class="chat-composer-mock"><span>スレッドへの返信欄</span><div><small>固定見本 · 入力・送信なし</small><b aria-hidden="true">＋　Aa</b></div></div>';
    case "chat-outcome-note": return '<aside class="chat-outcome-note"><b>速い履歴が、いつも有利とは限らない</b><p>固定24秒の例は、テンプレートの説明へ。<br>相手の発動時刻・細かい被害で結果が変わる。<br>シールド・収益・再発動はありません。</p></aside>';
    case "chat-local-note": return '<p class="chat-local-note">外部への送信・同期なし。<br>PDFもページ内プレビューです。</p>';
    default: return "";
  }
}
