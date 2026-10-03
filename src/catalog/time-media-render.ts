export function timeMediaHeader(theme:string):string {
  if(theme==='webarchive')return '<div class="archive-word"><i aria-hidden="true">▥</i><span>revisit.<small>Wayback Machine風 · 非公式UIモチーフ</small></span></div><nav>保存記録　　コレクション　　このアーカイブについて</nav>';
  if(theme==='livechannel')return '<div class="live-word">sidecast<small>Twitch風 · 非公式UIモチーフ</small></div><nav><b>フォロー中</b><span>見つける</span><span>···</span></nav><div class="live-search">配信を検索 <span>⌕</span></div><span class="live-local">架空の配信</span>';
  return '';
}
export function timeMediaDecor(kind:string):string {
  switch(kind){
    case 'archive-history':return `<div class="archive-history"><div class="archive-history-bars" aria-hidden="true">${Array.from({length:48},(_,i)=>`<i style="height:${8+(i*13+Math.floor(i/7)*11)%34}px"></i>`).join('')}</div><div class="archive-years"><span>1999</span><span>2004</span><b>2009</b><span>2014</span><span>2019</span><span>2024</span></div><small>架空の保存記録を表示中 · 実際の取得回数ではありません</small></div>`;
    case 'archive-date':return '<div class="archive-date"><span>‹</span><strong>2009年 10月</strong><span>›</span><small>保存日の例</small></div>';
    case 'archive-calendar':return `<div class="archive-calendar"><div class="calendar-week">${['日','月','火','水','木','金','土'].map(day=>`<b>${day}</b>`).join('')}</div><div class="calendar-days">${Array.from({length:35},(_,i)=>i<4||i>34?'<span></span>':`<span class="${[7,12,18,24,30].includes(i)?'captured':''}">${i-3}</span>`).join('')}</div><small>● 保存日（架空）　選択中の記録を右に表示</small></div>`;
    case 'archive-caption':return '<aside class="archive-caption"><b>保存されたページを、今のページで読む。</b><p>これは架空の記録画面です。元のサイトに変更を加えず、集めたUIを組み合わせています。</p><small>キャッシュは近くのPDFを守る · 出典とページ送りは記事の通常発動を待つ</small></aside>';
    case 'archive-disclaimer':return '<small class="archive-disclaimer">記録の日付・件数・本文はオリジナルの架空データです。Webアーカイブへの取得・保存・削除は行いません。</small>';
    case 'live-channel-rail':return `<aside class="live-channel-rail"><b>◉</b>${['m','p','k','r','w','s'].map((name,i)=>`<span class="live-avatar avatar-${i%3}">${name}<i></i></span>`).join('')}<small>発見<br>⌕</small></aside>`;
    case 'live-title':return '<div class="live-title"><b>みちくさの制作部屋</b><span>● LIVE · 架空の配信</span></div>';
    case 'live-broadcast':return '<section class="live-broadcast"><i class="live-broadcaster">m</i><div><b>みちくさ</b><p>古いリンクと、新しい動画。今日はどうつなぐ？</p><span>制作・雑談</span><span>日本語</span><small>表示人数や配信時間は演出です</small></div></section>';
    case 'live-about':return '<aside class="live-about"><b>配信について</b><span>好きなWebを集めて、動くページを作っています。</span></aside>';
    case 'live-chat-note':return '<aside class="live-chat-note"><p><b>page_builder</b> 表の中にも部品が入るんだ</p><p><b>mado</b> 別のサイトのUIもつながった！</p><p><b>archivist</b> 応援はシールドになるのね</p><small>表示用の架空会話 · 外部へ送信しません</small></aside>';
    case 'live-chat-footer':return '<div class="live-chat-footer"><small>チャットのマナーを守りましょう</small><div>メッセージ欄（表示用） <span>☺</span></div><b>外部送信なし</b></div>';
    default:return '';
  }
}
