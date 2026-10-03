/** Original native-audio UI. Generated wave geometry; no sound file or provider resource. */
const escape=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]!);
const wavePath=Array.from({length:52},(_,i)=>{
  const height=12+(i*17+Math.floor(i/7)*11)%34;
  return `M${i*8} ${(50-height)/2}h4v${height}h-4z`;
}).join('');
const waveSvg=()=>`<svg viewBox="0 0 416 50" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="${wavePath}"/></svg>`;

export function audioPlayerMarkup(label='夜のインターネット'):string {
  return `<section class="native-audio-player"><div class="audio-cover" aria-hidden="true"><i></i><b>W<br>S</b></div><header class="audio-track-heading"><button type="button" class="native-audio-play" data-ui="audio-play" aria-pressed="false" aria-label="音声UIをプレビュー（実音声なし）"><span class="audio-play-symbol" aria-hidden="true">▶</span><span class="audio-pause-symbol" aria-hidden="true">Ⅱ</span></button><div><small>window sessions</small><strong>${escape(label)}</strong></div><span class="audio-track-tag">ORIGINAL DEMO</span></header><div class="audio-waveform" role="img" aria-label="架空の音声波形"><div class="audio-wave-base">${waveSvg()}</div><div class="audio-wave-played">${waveSvg()}</div><span class="audio-comment-pin" style="left:24%" aria-hidden="true">m</span><span class="audio-comment-pin" style="left:71%" aria-hidden="true">p</span></div><footer><time class="audio-time">0:00</time><span>/ 3:12</span><small>架空の波形・実音声なし</small><b aria-hidden="true">◖</b></footer></section>`;
}

export function audioHeader():string {
  return '<div class="audio-site-word"><i aria-hidden="true">≈</i><span>wave.note<small>SoundCloud風 · 非公式UIモチーフ</small></span></div><nav><b>ホーム</b><span>フィード</span><span>ライブラリ</span></nav><div class="audio-site-search">探す <span>⌕</span></div><span class="audio-site-local">音声なしの模擬UI</span>';
}
export function audioDecor(kind:string):string {
  switch(kind){
    case 'audio-profile':return '<section class="audio-profile"><i aria-hidden="true">WS</i><div><h1>window sessions</h1><span>Small sounds from the old web</span><small>架空のトラック・オリジナルの波形描画</small></div><b>音声ファイルには接続しません</b></section>';
    case 'audio-tabs':return '<nav class="audio-tabs"><b>トラック</b><span>人気</span><span>アルバム</span><span>プレイリスト</span></nav>';
    case 'audio-makers':return '<aside class="audio-makers"><h3>見つけよう、新しい作り手</h3><p><i>m</i><span><b>morning browser</b><small>小さな風景と音</small></span><em>＋</em></p><p><i>p</i><span><b>page radio</b><small>懐かしいインターネット</small></span><em>＋</em></p><small>すべて架空のプロフィールです</small></aside>';
    case 'audio-notes':return '<aside class="audio-notes"><h3>制作ノート</h3><p>雨の窓、古い端末、深夜の静かなページ。そんな雰囲気を、架空の波形にしました。</p><div><span>#ambient</span><span>#web</span><span>#original</span></div><small>音声を流す機能はありません。<br>ゲーム内の攻撃は、波形UIの発動として表現します。</small></aside>';
    case 'audio-connections':return '<aside class="audio-connections"><h3>音を、つなぐ。</h3><p>リポストは原本の通常発動を待ちます。<br>動画用2×や文字強化は音声には効きません。</p><small>元のサイトを離れても、操作の形を残す。</small></aside>';
    case 'audio-comments':return '<section class="audio-comments"><i>m</i><div><header><b>mado</b><small>0:24のコメント（架空）</small></header><p>このあたりの静かな波形、好きです。</p><span>表示用の会話 · コメントは送信できません</span></div></section>';
    default:return '';
  }
}
