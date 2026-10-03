import type { Item } from "../types.js";

const escape = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const label = (p: Item, fallback: string) => escape(p.label || fallback);

/** These are intentionally hand-authored; no provider markup, logos or external avatars. */
export function socialPartMarkup(p: Item): string {
  switch (p.type) {
    case "tw_post":
      return `<article class="social-post classic-post"><i class="social-avatar classic-avatar" aria-hidden="true">m</i><div class="social-post-content"><header><b>みちくさ</b> <span>@michikusa_web</span><small>1分前</small></header><p>${label(p, "小さなWebを、もう一度つないでみよう。 #oldweb")}</p><footer><span>webから</span><span class="social-post-state">今をつぶやく</span></footer></div></article>`;
    case "tw_retweet":
      return `<button type="button" class="social-action classic-action" data-ui="retweet" aria-pressed="false"><b aria-hidden="true">⇄</b><span>${label(p, "リツイート")}</span></button>`;
    case "tw_favorite":
      return `<button type="button" class="social-action classic-action favorite-action" data-ui="favorite" aria-pressed="false"><b aria-hidden="true">☆</b><span>${label(p, "お気に入り")}</span></button>`;
    case "tw_follow":
      return `<button type="button" class="social-action classic-follow" data-ui="follow" aria-pressed="false"><b aria-hidden="true">＋</b><span>${label(p, "フォローする")}</span></button>`;
    case "x_post":
      return `<article class="social-post modern-post"><i class="social-avatar modern-avatar" aria-hidden="true">R</i><div class="social-post-content"><header><b>Relay Studio</b><span class="social-verified" aria-label="架空アカウントの確認済み表示">✓</span><span>@relay_studio · 3分</span><small>···</small></header><p>${label(p, "新しいUIをつなぐたび、ページの使い方が変わる。次は、どの組み合わせにしよう。")}</p><footer class="modern-post-actions"><span>↶ 12</span><span>⇄ 24</span><span>♡ 128</span><span>▥ 2,048</span><span class="social-post-state">↥</span></footer></div></article>`;
    case "x_quote":
      return `<article class="native-quote"><div class="quote-comment">${label(p, "この発見を、引用して残しておこう。")}</div><blockquote><header><i class="quote-avatar" aria-hidden="true">u</i><b>ui_archive</b><span>@web_archive</span></header><p>ひとつ前の投稿に、次のアイデアがあった。</p><small class="quote-state">原本の通常発動を待っています</small></blockquote></article>`;
    case "x_note":
      return `<aside class="native-community-note"><header><b aria-hidden="true">▤</b><strong>読者が背景情報を追加しました</strong></header><p>${label(p, "別の視点を添えて、ページの情報を読みやすくします。")}</p><footer>役に立ちましたか？ <span>はい · いいえ</span></footer></aside>`;
    case "x_bookmark":
      return `<button type="button" class="social-action modern-bookmark" data-ui="bookmark" aria-pressed="false"><b aria-hidden="true">♧</b><span>${label(p, "ブックマーク")}</span></button>`;
    default: return "";
  }
}

export function socialHeader(theme: string): string {
  if (theme === "twitter") return `<div class="classic-social-word">chirp<span>.</span><small>旧Twitter風（2010年代） · 非公式UIモチーフ</small></div><nav class="classic-social-nav"><b>ホーム</b><span>プロフィール</span><span>メッセージ</span></nav><div class="classic-social-search">検索 <span>⌕</span></div>`;
  if (theme === "x") return `<div class="modern-social-word">Crossline<small>X風 · 非公式UIモチーフ</small></div><span class="modern-social-subtitle">ひとつの会話から、次の世界へ。</span><div class="site-header-end"><span>⌕</span><i class="social-avatar modern-avatar">R</i></div>`;
  return "";
}

export function socialDecor(kind: string): string {
  switch (kind) {
    case "tw-timeline": return `<div class="classic-timeline-tabs"><b>タイムライン</b><span>@返信</span><span>リツイート</span><span>リスト ▾</span></div>`;
    case "tw-composer": return `<section class="classic-composer"><b>いまどうしてる？</b><div class="classic-composer-input">今日のインターネットを、ひとこと。</div><footer><span>140</span><b>ツイート</b></footer></section>`;
    case "tw-profile": return `<section class="classic-sidebar"><header><i class="social-avatar classic-avatar">m</i><div><b>みちくさ</b><small>@michikusa_web</small></div></header><div class="classic-profile-stats"><span><b>128</b>ツイート</span><span><b>42</b>フォロー</span><span><b>256</b>フォロワー</span></div><p>ふらっと立ち寄れるページを作っています。</p></section>`;
    case "tw-trends": return `<section class="classic-sidebar classic-trends"><h3>いま話題のキーワード <small>変更</small></h3>${["#古いインターネット", "青いリンク", "#今日のホームページ", "リツイート", "新しい検索窓"].map((s) => `<p>${s}</p>`).join("")}<small>時系列の会話をのぞいてみよう。</small></section>`;
    case "tw-discover": return `<section class="classic-sidebar classic-discover"><h3>おすすめユーザー</h3><div><i class="social-avatar">k</i><p><b>紙ひこうき</b><small>@paper_web</small></p><span>フォロー</span></div><div><i class="social-avatar">w</i><p><b>窓ぎわ通信</b><small>@window_log</small></p><span>フォロー</span></div><small>見つける · リストを見る</small></section>`;
    case "tw-footer": return `<div class="classic-social-footer">さらに読み込む ▾<small>架空の投稿・オリジナル描画 · 外部へ送信しません</small></div>`;
    case "x-navigation": return `<nav class="modern-social-navigation"><b class="modern-nav-mark">C<span>＋</span></b>${[["⌂", "ホーム"], ["⌕", "話題を検索"], ["♧", "通知"], ["✉", "メッセージ"], ["▱", "ブックマーク"], ["♧", "コミュニティ"], ["✦", "Premium"], ["◯", "プロフィール"], ["···", "もっと見る"]].map(([icon, title]) => `<div><i>${icon}</i><span>${title}</span></div>`).join("")}<strong>ポストする</strong><footer><i class="social-avatar modern-avatar">R</i><span>Relay Studio<small>@relay_studio</small></span></footer></nav>`;
    case "x-feed-tabs": return `<nav class="modern-feed-tabs"><b>おすすめ</b><span>フォロー中</span></nav>`;
    case "x-premium": return `<section class="modern-sidebar premium-callout"><h3>Premiumにアップグレード</h3><p>会話をもっと深く。<br>自分のページを、次の形へ。</p><b>詳細を見る</b><small>表示のみ・購入できません</small></section>`;
    case "x-trends": return `<section class="modern-sidebar modern-trends"><h3>いまどうしてる？</h3>${[["Web · トレンド", "#UIのある生活", "1,280件のポスト"], ["テクノロジー", "古いホームページ", "4,096件のポスト"], ["日本のトレンド", "ページ作り", "512件のポスト"]].map(([category, title, count]) => `<div><small>${category}</small><b>${title}</b><small>${count}</small></div>`).join("")}<span>さらに表示</span></section>`;
    case "x-discover": return `<section class="modern-sidebar modern-discover"><h3>おすすめのユーザー</h3><div><i class="social-avatar modern-avatar">a</i><p><b>Archive Lab</b><small>@archive_lab</small></p><b>フォロー</b></div><div><i class="social-avatar">p</i><p><b>Page Works</b><small>@page_works</small></p><b>フォロー</b></div><small>非公式の架空ページ · 操作はローカルのみ</small></section>`;
    default: return "";
  }
}
