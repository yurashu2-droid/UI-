import type { Item } from "../types.js";
const escape = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const label = (p: Item, fallback: string) => escape(p.label || fallback);

export function communityPartMarkup(p: Item): string {
  switch (p.type) {
    case "nc_player": return `<section class="native-nico-player"><div class="nico-screen"><div class="nico-screen-grid"></div><div class="nico-screen-title"><small>AN ORIGINAL FILM / UI RAID</small><strong>${label(p, "Webの続きを、作ってみた。")}</strong><span>PAGE / PLAY</span></div><div class="nico-comment-samples" aria-hidden="true"><span>ここ好き</span><span>88888888</span><span>懐かしい</span></div><div class="nico-comments" aria-live="off"></div><button type="button" class="nico-play" data-ui="play" aria-label="コメント動画を再生">▶</button><span class="video-caption"></span></div><footer><b>▶</b><span class="video-time">0:00</span><small>/ 3:42</small><i></i><span>コメント ON</span><b>⚙</b></footer></section>`;
    case "nc_comment": return `<form class="native-comment-input" data-ui="comment"><span class="comment-command">コマンド ▾</span><input aria-label="動画コメント" value="${label(p, "ここ好き")}" autocomplete="off"><button type="button" data-ui="comment">コメント</button></form>`;
    case "nc_tag": return `<nav class="native-video-tags" aria-label="動画タグ"><b>タグ</b><a href="#" data-ui="link">${label(p, "作ってみた")}</a><a href="#" data-ui="link">インターネット</a><a href="#" data-ui="link">懐かしい未来</a><span>＋</span></nav>`;
    case "rd_post": return `<article class="native-forum-post"><header><b>r/webparts</b><span>u/page_gardener · 1時間前</span><small>···</small></header><h3>${label(p, "あなたの好きなWeb部品は何ですか？")}</h3><p>昔のリンクも、新しい検索窓も。組み合わせ方を教えてください。</p><footer><span class="forum-post-state">▱ 24件のコメント</span><span>↗ シェア</span><span>▧ 保存</span></footer></article>`;
    case "rd_vote": return `<div class="native-vote-column"><button type="button" data-ui="vote-up" aria-label="投稿に賛成する" aria-pressed="false">⇧</button><strong class="vote-score">128</strong><button type="button" data-ui="vote-down" aria-label="投稿に反対する" aria-pressed="false">⇩</button><small>${label(p, "vote")}</small></div>`;
    case "rd_thread": return `<section class="native-reply-thread"><header><strong>${label(p, "返信スレッド")}</strong><span class="thread-state">並べ替え：おすすめ ▾</span></header><div class="empty-container"><div class="reply-placeholder"><b>u/oldweb_reader</b><p>文章とリンクを組み合わせるのが好きです。</p><small>↶ 返信　⇧　⇩</small></div><div class="reply-placeholder nested"><b>u/page_builder</b><p>そこに動画も加えてみました。</p><small>↶ 返信　⇧　⇩</small></div></div><div class="container-slot"></div></section>`;
    default: return "";
  }
}

export function communityHeader(theme: string): string {
  if (theme === "nico") return `<div class="nico-word">stream.note<small>ニコニコ風 · 非公式UIモチーフ</small></div><nav><span>動画</span><span>生放送</span><span>ランキング</span></nav><div class="nico-header-search">動画を検索 <b>⌕</b></div><span class="nico-header-account">マイページ</span>`;
  if (theme === "reddit") return `<div class="forum-word"><i>t</i><span>threadly<small>Reddit風 · 非公式UIモチーフ</small></span></div><div class="forum-header-search">⌕　r/webparts を検索</div><nav><span>＋ 作成</span><span>♧</span><span>◯</span></nav>`;
  return "";
}

export function communityDecor(kind: string): string {
  switch (kind) {
    case "nico-title": return `<div class="nico-page-title"><h1>小さなWebを、つないでみた。【UI制作】</h1><p>再生 12,804　コメント 1,280　マイリスト 256 <span>架空の動画・投稿です</span></p></div>`;
    case "nico-comments-list": return `<aside class="nico-comments-list"><header><b>コメント</b><span>NG設定</span></header>${[["00:03", "うぽつ"], ["00:12", "懐かしい色だ"], ["00:24", "ここ好き"], ["00:42", "このボタンほしい"], ["01:10", "88888888"], ["01:24", "つながった！"], ["02:18", "おつかれさま"]].map(([time, text]) => `<div><small>${time}</small><span>${text}</span></div>`).join("")}</aside>`;
    case "nico-uploader": return `<section class="nico-uploader"><i>u</i><div><b>小さなWeb工房</b><span>好きなUIを集めて、ひとつのページにしました。</span><small>オリジナル映像モチーフ · 外部動画の再生はしません</small></div><strong>＋ フォロー</strong></section>`;
    case "nico-related": return `<aside class="nico-related"><h3>関連動画</h3>${["1999年のリンクを並べる", "文字サイズを大きくしてみた", "ボタンだけで暮らすWeb"].map((title, i) => `<div><i>${["HTML", "Aa", "▶"][i]}</i><p><b>${title}</b><small>UI工房　1,024再生</small></p></div>`).join("")}</aside>`;
    case "reddit-community": return `<div class="forum-community-banner"><div></div><section><i>wp</i><span><b>Web Parts Workshop</b><small>r/webparts</small></span><strong>参加済み</strong></section></div>`;
    case "reddit-about": return `<aside class="forum-sidebar"><h3>このコミュニティについて</h3><p>小さなWeb部品と、変わった組み合わせの話をする場所。</p><div class="forum-community-stats"><span><b>12.8k</b>メンバー</span><span><b>● 128</b>オンライン</span></div><hr><small>2026年作成 · 公開コミュニティ</small><b class="forum-sidebar-action">投稿を作成</b></aside>`;
    case "reddit-rules": return `<aside class="forum-sidebar forum-rules"><h3>r/webparts のルール</h3>${["相手への敬意を忘れずに", "部品の出典を残す", "違う組み合わせを歓迎する", "繰り返しだけの投稿は控える"].map((s, i) => `<p><b>${i + 1}</b>${s}<span>⌄</span></p>`).join("")}<small>架空の投稿・会話です。<br>実際の投票や送信は行いません。</small></aside>`;
    default: return "";
  }
}
