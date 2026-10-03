import { RATE_LIMIT } from "./combat-rules.js";
import { targetCaption } from "./catalog/target-caption.js";
import { jobTableMarkup } from "./catalog/server-pressure-render.js";
import { serviceFormHeader, serviceFormDecor } from "./catalog/service-form-render.js";
import { projectBoardHeader, projectBoardDecor } from "./catalog/project-board-render.js";
import { mailHeader, mailDecor } from "./catalog/mail-render.js";
import { musicShopHeader, musicShopDecor } from "./catalog/music-shop-render.js";
import { personalWebHeader, personalWebDecor } from "./catalog/personal-web-render.js";
import { mapSearchHeader, mapSearchDecor } from "./catalog/map-search-render.js";
import { rankedNewsHeader, rankedNewsDecor } from "./catalog/ranked-news-render.js";
import { releasesDecor } from "./catalog/releases-render.js";
import { marketplaceHeader, marketplaceDecor } from "./catalog/marketplace-render.js";
import { feedreaderHeader, feedreaderDecor } from "./catalog/feedreader-render.js";
import { qandaHeader, qandaDecor } from "./catalog/qanda-render.js";
import { audioPlayerMarkup, audioHeader, audioDecor } from "./catalog/audio-render.js";
import { documentsHeader, documentsDecor } from "./catalog/documents-render.js";
import { historyPartMarkup } from "./catalog/history-render.js";
import { timeMediaHeader, timeMediaDecor } from "./catalog/time-media-render.js";
import { discoveryHeader, discoveryDecor } from "./catalog/discovery-render.js";
import D from "./data.js";
import C from "./document.js";
import E from "./engine.js";
import type { Item } from "./types.js";
import { socialPartMarkup, socialHeader, socialDecor } from "./catalog/social-render.js";
import { knowledgePartMarkup, knowledgeHeader, knowledgeDecor } from "./catalog/knowledge-render.js";
import { communityPartMarkup, communityHeader, communityDecor } from "./catalog/community-render.js";

/* Native HTML motifs and recursive document rendering. No fetched content. */

const entities: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => entities[c]);
const paths = {
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  play: '<path d="m8 5 12 7-12 7z"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  mic: '<rect x="8" y="2" width="8" height="13" rx="4"/><path d="M5 11v2a7 7 0 0 0 14 0v-2M12 20v3"/>',
  cart: '<path d="M2 3h3l3 13h11l3-10H6M9 21h.1M19 21h.1"/>',
  heart:
    '<path d="M20.8 4.7a5.5 5.5 0 0 0-7.8 0L12 5.8l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.5a5.5 5.5 0 0 0 0-7.8Z"/>',
  like: '<path d="M7 10h4l3-8c3 0 3 3 1 7h5c2 0 2 2 1 5l-2 6H7zM3 10h4v11H3z"/>',
  chevron: '<path d="m8 4 8 8-8 8"/>',
  arrow: '<path d="M4 12h16M14 6l6 6-6 6"/>',
  check: '<path d="m5 12 5 5L20 6"/>',
  volume: '<path d="M3 9h4l5-4v14l-5-4H3zM16 8a6 6 0 0 1 0 8"/>',
  settings:
    '<path d="m12 3 3 2 4 1v4l2 2-2 3v4h-4l-3 2-3-2H5v-4l-2-3 2-2V6l4-1z"/><circle cx="12" cy="12" r="3"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 8V3H3v12h5"/>',
  grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
  undo: '<path d="m8 4-5 5 5 5M3 9h10a7 7 0 0 1 0 14"/>',
  cursor: '<path d="m5 3 15 11-8 1-4 7z"/>',
  link: '<path d="m9 15 6-6M8 16l-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0M16 8l1-1a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0"/>',
  layers: '<path d="m12 3 10 5-10 5L2 8zM2 12l10 5 10-5M2 16l10 5 10-5"/>',
  trash: '<path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/>',
  eye: '<path d="M2 12S6 5 12 5s10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
};
function icon(n: keyof typeof paths, cls = "") {
  return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[n] || paths.grid}</svg>`;
}
function wordGoogle() {
  return '<span class="google-word"><i>G</i><i>o</i><i>o</i><i>g</i><i>l</i><i>e</i></span>';
}
function text(p: Item, fallback: string) {
  return esc(p.label || fallback);
}
function videoCopy(p: Item, kicker: string, fallback: [string, string]) {
  const custom = p.label.trim().length > 0;
  const title = custom
    ? `<strong title="${esc(p.label)}">${esc(p.label)}</strong>`
    : `<strong>${fallback.map(esc).join("<br>")}</strong>`;
  return `<div class="video-copy${custom ? " has-custom-title" : ""}"><small>${esc(kicker)}</small>${title}</div>`;
}
function button(content: string, cls = "", action = "press") {
  return `<button type="button" class="native-button ${cls}" data-ui="${action}">${content}</button>`;
}
function markup(p: Item, ctx: { side?: string; theme?: string } = {}) {
  const t = p.type;
  switch (t) {
    case "yt_play":
      return `<div class="native-video"><div class="video-grain"></div><div class="video-landscape"><i></i><i></i><i></i></div><div class="video-top"><span class="live-tag">● LIVE</span><span>RECOVERED SIGNAL / 04</span></div>${videoCopy(p, "A FILM FROM THE OLD WEB", ["THE INTERNET", "IS STILL YOURS."])}<span class="video-caption"></span><button class="video-play" type="button" data-ui="play" aria-label="動画を再生">${icon("play")}</button><div class="native-video-controls"><span>${icon("play")}${icon("volume")}<span class="video-time">0:00</span><i>/ 3:42</i></span><span>${icon("settings")}<b>⛶</b></span></div></div>`;
    case "yt_speed":
      return button(
        `<b class="speed-num">2×</b><span class="chev">⌄</span>`,
        "yt-button speed-button",
      );
    case "yt_ad":
      return `<aside class="native-ad"><span class="ad-kicker">スポンサー</span><div><b>${text(p, "インターネットを、もう一度。")}</b><small>Every view builds something new.</small></div><button type="button" data-ui="press">詳しく見る ↗</button><span class="ad-money">$<span class="state-income">0</span></span></aside>`;
    case "yt_sub":
      return button(text(p, "メンバーになる"), "subscribe-button", "subscribe");
    case "yt_like":
      return button(
        `${icon("like")}<span class="like-value">128</span><span class="split-line"></span><span class="downlike">♧</span>`,
        "yt-button like-button",
        "like",
      );
    case "yt_progress":
      return `<div class="native-seek"><input type="range" min="0" max="100" value="22" aria-label="動画の再生位置"><div class="seek-fill"></div><i></i></div>`;
    case "yt_caption":
      return button(
        '<b class="cc-icon">CC</b>',
        "yt-button caption-button",
        "caption",
      );
    case "yt_autoplay":
      return `<label class="native-toggle"><span>自動再生</span><input type="checkbox" checked aria-label="自動再生"><i><b>▶</b></i></label>`;
    case "yt_notify":
      return button(
        `${icon("bell")}<i class="notification-dot"></i>`,
        "yt-button notify-button",
        "notify",
      );
    case "am_buy":
      return button(text(p, "カートに入れる"), "buy-button", "buy");
    case "am_cart":
      return `<section class="native-cart"><div class="cart-heading">${icon("cart")}<b>カート</b><span class="cart-state">0</span></div><div class="cart-subtotal"><span>小計 <small>（UI部品）</small></span><strong>$<span class="state-income">0</span></strong></div><div class="cart-charge"><i></i></div><small class="cart-note">まとめて発送 / <span class="state-charge">0</span> of 3</small></section>`;
    case "am_prime":
      return button("<em>prime</em><span>お急ぎ便</span>", "prime-button");
    case "am_deal":
      return `<div class="native-sale"><b>タイムセール</b><span>あと <strong class="sale-clock">00:05</strong></span><i>終了間近</i></div>`;
    case "am_product":
      return `<article class="native-product"><div class="product-visual"><div class="mini-device"><div><span>UI</span><i></i></div><b></b></div><small>UI / 01</small></div><div class="product-detail"><span class="product-category">RECOVERED HARDWARE</span><h3>${text(p, "ポータブル UI デッキ")}</h3><p>好きなWebを持ち歩く。<br>小さなブラウザ、無限の可能性。</p><div class="product-price"><sup>¥</sup>1,980</div><small class="product-stock">在庫あり</small></div></article>`;
    case "am_quantity":
      return `<label class="native-quantity"><span>数量:</span><select aria-label="数量"><option>1</option><option>2</option><option>3</option></select></label>`;
    case "am_rating":
      return `<div class="native-rating"><span>★★★★★</span><b>4.8</b><a href="#" data-ui="link">128件の評価</a></div>`;
    case "am_coupon":
      return `<label class="native-coupon"><input type="checkbox" checked><span>クーポン</span><b>¥200 OFF を適用</b></label>`;
    case "am_wish":
      return button(
        `${icon("heart")}${text(p, "ほしい物リストに追加")}`,
        "wish-button",
        "wish",
      );
    case "go_search":
      return `<form class="native-search" data-ui="search">${icon("search")}<input type="search" aria-label="検索キーワード" placeholder="インターネットのつなぎ方" value="${p.label ? esc(p.label) : ""}" autocomplete="off"><span class="search-spark">✦</span></form>`;
    case "go_lucky":
      return button(text(p, "I'm Feeling Lucky"), "lucky-button");
    case "go_suggest":
      return `<div class="native-suggestions"><div>${icon("search")}<span>UI <b>シナジー</b></span><i>↖</i></div><div>${icon("search")}<span>インターネット <b>つなぎ方</b></span><i>↖</i></div><div>${icon("search")}<span>古いサイト <b>最新UI</b></span><i>↖</i></div></div>`;
    case "go_ads":
      return `<article class="native-result native-search-ad"><div class="result-address"><b>スポンサー</b><i>ads.example / ui</i><span>⋮</span></div><a href="#" data-ui="link">${text(p, "あなたのサイトを、収益化。")}</a><p>検索するたびに広がる可能性。<br>その言葉が、次のアクセスをつくる。</p></article>`;
    case "go_tabs":
      return `<nav class="native-tabs" aria-label="検索カテゴリ">${["すべて", "画像", "動画", "ニュース", "ショッピング"].map((s, i) => `<button type="button" class="${i ? "" : "current"}" data-ui="tab">${s}</button>`).join("")}</nav>`;
    case "go_voice":
      return button(icon("mic"), "voice-button", "voice");
    case "go_result":
      return `<article class="native-result"><div class="result-address"><span class="result-favicon">↗</span><i>archive.example / journal / 01</i><span>⋮</span></div><a href="#" data-ui="link">${text(p, "小さなWebから、世界を組み直そう。")}</a><p>きれいな検索窓も、昔の青いリンクも。<br>好きな部品をつなげたら、あなただけのページになる。</p></article>`;
    case "go_translate":
      return `<label class="native-translate"><b>文<span>A</span></b><select aria-label="翻訳先"><option>日本語 → 英語</option><option>英語 → 日本語</option></select></label>`;
    case "go_page":
      return `<nav class="native-pagination google-pagination" aria-label="検索結果ページ">${[1, 2, 3, 4, 5, 6].map((n) => `<button type="button" data-ui="page" class="${n === 1 ? "current" : ""}">${n}</button>`).join("")}<button type="button" data-ui="page">次へ ›</button></nav>`;
    case "ab_link":
      return `<a class="native-old-link" href="#" data-ui="link">${text(p, "最新情報")}</a>`;
    case "ab_table":
      return `<table class="native-table"><thead><tr><th>Information</th></tr></thead><tbody><tr><td><div class="empty-container">ここは、かつての情報欄。<br>別のUIを中に配置できます。</div><div class="container-slot"></div></td></tr></tbody></table>`;
    case "ab_counter":
      return `<div class="native-counter">あなたは <span class="counter-digits">000<span class="counter-number">0128</span></span> 人目のお客様です。</div>`;
    case "ab_marquee":
      return `<div class="native-marquee"><span>★ ${text(p, "ようこそ、インターネットへ。")} ★　このホームページはずっと工事中です。 ★　</span></div>`;
    case "ab_heading":
      return `<h1 class="native-heading">${text(p, ctx.theme === "retro" ? "最新情報" : ctx.theme === "gov" ? "各種申請・お手続き" : "ぼくらの、インターネット。")}</h1>`;
    case "ab_hr":
      return '<div class="native-rule"><hr></div>';
    case "ab_mail":
      return `<a class="native-old-link old-mail" href="#" data-ui="link">${text(p, "メールはこちら")}</a>`;
    case "ab_nav":
      return `<a class="native-old-link" href="#" data-ui="link">${text(p, "プロフィール")}</a>`;
    case "ab_guestbook":
      return `<section class="native-bbs"><header>みんなの掲示板 <a href="#" data-ui="link">[書き込む]</a></header><div><b>通りすがり</b> <small>2026/09/17</small><p class="bbs-copy">懐かしい雰囲気ですね。<br>また遊びに来ます。</p></div></section>`;
    case "gov_pdf":
      return `<a class="native-pdf" href="#" data-ui="download"><span class="pdf-icon">PDF</span><span class="pdf-name">${text(p, "実施要領・申請の手引き")}<small>PDF形式 / 128KB</small></span>${icon("download")}</a>`;
    case "gov_form":
      return `<fieldset class="native-form"><legend>電子申請</legend><div class="form-subtitle">必要事項を確認し、送信してください。</div><div class="empty-container"><label>申請者氏名<input placeholder="氏名を入力" aria-label="申請者氏名"></label><small>UIを内側に置くと、この案内欄を置き換えます。</small></div><div class="container-slot"></div><span class="accepted-stamp">受理</span></fieldset>`;
    case "gov_font":
      return `<div class="native-font"><span>文字サイズ</span><div>${["小", "中", "大"].map((v, n) => `<button type="button" data-ui="font" class="${n === 1 ? "current" : ""}">${v}</button>`).join("")}</div></div>`;
    case "gov_notice":
      return `<aside class="native-notice"><b>お知らせ</b><span>${text(p, "ただいま各種手続きを受け付けています。")}</span>${icon("chevron")}</aside>`;
    case "gov_breadcrumb":
      return `<nav class="native-breadcrumb"><a href="#" data-ui="link">ホーム</a><span>›</span><a href="#" data-ui="link">行政サービス</a><span>›</span><b>各種お手続き</b></nav>`;
    case "gov_check":
      return `<label class="native-gov-check"><input type="checkbox"><span>${text(p, "内容を確認し、同意します")}</span></label>`;
    case "gov_accordion":
      return `<section class="native-accordion"><button class="accordion-summary" type="button" data-ui="accordion" aria-expanded="true">${text(p, "手続きのご案内")}<span>−</span></button><div class="empty-container">提出前に必要事項をご確認ください。</div><div class="container-slot"></div></section>`;
    case "gov_page":
      return `<nav class="native-pagination gov-pagination" aria-label="ページ番号"><button type="button" data-ui="page">‹</button>${[1, 2, 3, 4].map((n) => `<button type="button" data-ui="page" class="${n === 1 ? "current" : ""}">${n}</button>`).join("")}<button type="button" data-ui="page">›</button></nav>`;
    case "gov_submit":
      return button(
        `${text(p, "申請を送信")}${icon("arrow")}`,
        "gov-submit",
        "submit",
      );
    case "go_instant":
      return `<form class="native-search fused-instant" data-ui="search">${icon("search")}<input type="search" aria-label="検索キーワード" placeholder="" value="${p.label ? esc(p.label) : "UIを奪"}" autocomplete="off"><span class="instant-ghost">う方法</span><span class="instant-chip">インスタント</span></form>`;
    case "am_oneclick":
      return button(`<span class="oneclick-cart">${icon("cart")}<b class="cart-state">0</b></span><span>${text(p, "1-Click で今すぐ買う")}</span>`, "buy-button fused-oneclick", "buy");
    case "yt_embed":
      return `<div class="native-video fused-embed"><div class="video-grain"></div><div class="video-landscape"><i></i><i></i><i></i></div><div class="video-top"><span class="embed-tag">&lt;iframe&gt; EMBED</span><span>どこでも再生</span></div>${videoCopy(p, "EMBEDDED ANYWHERE", ["ONE PLAYER,", "EVERY PAGE."])}<span class="video-caption"></span><button class="video-play" type="button" data-ui="play" aria-label="動画を再生">${icon("play")}</button><div class="embed-seek"><i></i></div></div>`;
    case "ab_ticker":
      return `<div class="native-marquee fused-ticker"><b class="ticker-flag">速報</b><span>${text(p, "UIの統合が進んでいます")}　◆　インスタント検索が登場　◆　ワンクリック購入が話題に　◆　</span></div>`;
    case "ab_blog":
      return `<section class="native-bbs fused-blog"><header>コメント <span class="blog-count">(<span class="counter-number">128</span>)</span> <a href="#" data-ui="link">[コメントする]</a></header><div><b>名無しさん</b> <small>2004/03/01</small><p class="bbs-copy">トラックバックさせていただきました！<br>RSSにも登録しました。</p></div></section>`;
    case "gov_onestop":
      return button(`<span class="onestop-check">${icon("check")}</span>${text(p, "確認して申請する")}${icon("arrow")}`, "gov-submit fused-onestop", "submit");
    case "go_recaptcha":
      return `<label class="fused-recaptcha"><input type="checkbox" aria-label="私はロボットではありません"><span class="rc-box"></span><span class="rc-text">私はロボットではありません</span><span class="rc-logo"><i></i><small>reCAPTCHA<br>プライバシー - 利用規約</small></span></label>`;
    case "ad_retarget":
      return `<aside class="native-ad fused-retarget"><span class="ad-kicker">あなたへのおすすめ</span><div><b>${text(p, "さっき見ていた、あのUI。")}</b><small>まだ迷っていますか？ いまなら期間限定。</small></div><span class="retarget-eye">${icon("eye")}</span><span class="ad-money">$<span class="state-income">0</span></span></aside>`;
    case "am_newsletter":
      return `<form class="fused-newsletter" data-ui="press"><b>✉ メルマガ登録で ¥200 OFF</b><span class="nl-field">you@example.com</span><span class="nl-btn">登録</span></form>`;
    case "go_jobs":
      return jobTableMarkup();
    case "ad_popup":
      return `<aside class="native-popup-ad"><span class="popup-kicker">スポンサー · $3で出稿</span><strong>${text(p, "ちょっと、こちらも見ていきませんか？")}</strong><div class="popup-ad-footer"><span class="popup-state">出稿待ち</span><span class="popup-charge">$<span class="state-charge">0</span> / 6</span><button type="button" data-ui="press" aria-label="ポップアップ広告をプレビュー">詳しく見る ↗</button></div></aside>`;
    case "go_cache":
      return `<div class="native-cache"><a href="#" data-ui="cache">${text(p, "キャッシュを表示")}</a><span class="cache-copy-icon" aria-hidden="true">▤</span><small class="cache-meta"><span class="cache-state" role="status">準備完了</span><span class="cache-target">戦闘中に対象を表示</span></small></div>`;
    case "yt_tip":
      return `<button type="button" class="native-button native-support" data-ui="support">${icon("heart")}<span class="support-copy"><span>${text(p, "このページを応援する")}</span><small class="support-feedback">$3をシールドへ変換</small></span><small class="support-state">$<span class="state-charge">0</span> / 6</small></button>`;
    case "sc_track":
      return audioPlayerMarkup(p.label || "夜のインターネット");
    case "go_history":
      return historyPartMarkup(p.label || "変更履歴・版を復元");
    case "gov_rate_limit":
      return `<aside class="native-rate-limit"><header><code>429</code><strong>${text(p, "アクセスを整理しています")}</strong></header><p>非貫通を1発最大4軽減 · 共有枠は毎秒24補充</p><meter class="rate-budget-meter" min="0" max="${RATE_LIMIT.capacity}" value="0" hidden aria-label="ページ共有のアクセス整理枠"></meter><footer><span>共有枠 <b class="rate-budget">—</b> / ${RATE_LIMIT.capacity}</span><span>累計軽減 <b class="rate-total">—</b></span></footer></aside>`;
    default:
      return socialPartMarkup(p) || knowledgePartMarkup(p) || communityPartMarkup(p);
  }
}
const TAGS: Record<string, string> = {
  sc_track: "audio.waveform",
  go_history: "history.restore",
  go_jobs: "table.local-jobs",
  yt_play: "<video>",
  yt_speed: "button.ytp-speed",
  yt_ad: "<aside> ad",
  yt_sub: "button.subscribe",
  yt_like: "button.like",
  yt_progress: "input[type=range]",
  yt_caption: "button.cc",
  yt_autoplay: "input[type=checkbox] switch",
  yt_notify: "button.bell",
  am_buy: "input[type=submit]",
  am_cart: "<section> #cart",
  am_prime: "button.prime",
  am_deal: "div.deal-badge",
  am_product: "<article> product",
  am_quantity: "<select>",
  am_rating: "div.stars",
  am_coupon: "input[type=checkbox]",
  am_wish: "button.wishlist",
  go_search: "<form role=search>",
  go_lucky: "input[type=submit]",
  go_suggest: "<ul role=listbox>",
  go_ads: "div.ad-result",
  go_tabs: "<nav> tabs",
  go_voice: "button.mic",
  go_result: "div.g > a",
  go_translate: "<select> lang",
  go_page: "<nav> pager",
  ab_link: "<a href>",
  ab_table: "<table border=1>",
  ab_counter: "<img> counter.cgi",
  ab_marquee: "<marquee>",
  ab_heading: "<h1>",
  ab_hr: "<hr>",
  ab_mail: "<a href=mailto:>",
  ab_nav: "<a href> nav",
  ab_guestbook: "bbs.cgi",
  gov_pdf: "<a> .pdf",
  gov_form: "<fieldset>",
  gov_font: "button[font-size]",
  gov_notice: "<aside> notice",
  gov_breadcrumb: "<ol> breadcrumb",
  gov_check: "input[type=checkbox]",
  gov_accordion: "<details>",
  gov_page: "<nav> pagination",
  gov_submit: "<button type=submit>",
  go_instant: "<form> autocomplete",
  am_oneclick: "button#1-click",
  yt_embed: "<iframe> embed",
  ab_ticker: "div.breaking-news",
  ab_blog: "#comments",
  gov_onestop: "<button> one-stop",
  go_recaptcha: "div.g-recaptcha",
  ad_retarget: "<ins> retargeting",
  am_newsletter: "<form> newsletter",
  ad_popup: "<aside> display-ad",
  go_cache: "<a> cached-copy",
  yt_tip: "<button> support",
  gov_rate_limit: "<aside> 429-too-many-requests",
  tw_post: "<article> status-140",
  tw_retweet: "<button> retweet",
  tw_favorite: "<button> favorite",
  tw_follow: "<button> follow",
  x_post: "<article> post",
  x_quote: "<blockquote> quote-post",
  x_note: "<aside> community-context",
  x_bookmark: "<button> bookmark",
  wk_article: "<article> encyclopedia",
  wk_reference: "<ol> references",
  wk_infobox: "<section> infobox",
  gh_diff: "<section> diff",
  gh_transfer: "<progress> file-transfer",
  gh_commit: "<div> commit-history",
  gh_checks: "<section> check-runs",
  nc_player: "<section> comment-video",
  nc_comment: "<form> timed-comment",
  nc_tag: "<nav> video-tags",
  rd_post: "<article> community-post",
  rd_vote: "<div> vote-column",
  rd_thread: "<section> reply-thread",
};
const thumbs = [
  "linear-gradient(135deg,#1f3b4d,#c77b52)",
  "linear-gradient(135deg,#2c2438,#8f6fd8)",
  "linear-gradient(135deg,#123c2c,#9bd18b)",
  "linear-gradient(135deg,#402020,#f1a34a)",
  "linear-gradient(135deg,#10202f,#3aa3d6)",
];
const recommendations: [string, string, string, number][] = [
  ["検索窓（中古）", "¥480", "★★★★☆", 0],
  ["2× 再生ボタン", "¥1,200", "★★★★★", 1],
  ["&lt;hr&gt; 水平線 10本組", "¥98", "★★★☆☆", 2],
  ["電子申請フォーム", "¥3,300", "★★☆☆☆", 3],
  ["青いリンク 詰め合わせ", "¥150", "★★★★☆", 4],
];
function relatedRow(n: number, title: string, ch: string, views: string) {
  return `<div class="d-rel"><i style="background:${thumbs[n % thumbs.length]}"><em>${["12:04", "3:42", "48:10", "7:31", "1:02:55"][n % 5]}</em></i><div><b>${title}</b><small>${ch}</small><small>${views}</small></div></div>`;
}
function decorMarkup(kind: string) {
  switch (kind) {
    case "yt-title":
      return `<h2 class="d-yt-title">【作業用】古いインターネットの音を3時間聴く</h2><div class="d-yt-meta">12万 回視聴 ・ 3 日前 ・ <a>#UIRAID</a> <a>#oldweb</a></div>`;
    case "yt-channel":
      return `<div class="d-yt-channel"><i class="d-avatar">U</i><div><b>UI RAID Channel <span>✓</span></b><small>チャンネル登録者数 12.8万人</small></div></div>`;
    case "yt-comments":
      return `<div class="d-yt-comments"><b>コメント 1,284 件 <span>≡ 並べ替え</span></b><div class="d-c"><i style="background:#b9d4f2">o</i><p><b>@oldweb_fan</b> <small>2 日前</small><br>2:14 のダイヤルアップ音で泣いた</p></div><div class="d-c"><i style="background:#f2c9b9">n</i><p><b>@netsurfer98</b> <small>1 日前</small><br>このページ、なぜか検索窓がある</p></div></div>`;
    case "yt-chips":
      return `<div class="d-chips"><b>すべて</b><span>関連動画</span><span>ライブ</span><span>最近アップロード</span></div>`;
    case "yt-related":
      return `<div class="d-related">${relatedRow(0, "1999年のホームページを再現してみた", "レトロWeb研究所", "8.1万 回視聴")}${relatedRow(1, "ボタンだけで戦う方法【解説】", "UI Lab", "23万 回視聴")}${relatedRow(2, "marqueeタグの歴史", "HTML博物館", "3,020 回視聴")}</div>`;
    case "yt-related2":
      return `<div class="d-related">${relatedRow(3, "カートに入れるボタン 100連打", "shopping tube", "1.2万 回視聴")}</div>`;
    case "am-nav":
      return `<nav class="d-am-nav"><b>≡ すべて</b><span>タイムセール</span><span>ベストセラー</span><span>ほしい物リスト</span><span>ギフト券</span><span>UIパーツ</span><em>本日のお届け ›</em></nav>`;
    case "am-breadcrumb":
      return `<div class="d-am-crumb"><a>家電＆カメラ</a> › <a>パソコン・周辺機器</a> › <a>UIパーツ</a> › ポータブル</div>`;
    case "am-bullets":
      return `<div class="d-am-bullets"><b>この商品について</b><ul><li>【どこでもWeb】どんなサイトのボタンも、1台で押せます。</li><li>【互換性】1998年〜2024年のUIに対応（ベベル・グロッシー・グラス）。</li><li>【安心】実際の購入・送信は行いません。ローカル演出専用です。</li></ul></div>`;
    case "am-recs":
      return `<div class="d-am-recs"><b>この商品をチェックした人はこんな商品もチェックしています</b><div>${recommendations
        .map(
          ([t, p, r, n]) =>
            `<article><i style="background:${thumbs[n]}"></i><a>${t}</a><span>${r}</span><strong>${p}</strong></article>`,
        )
        .join("")}</div></div>`;
    case "am-footer":
      return `<div class="d-am-footer">トップへ戻る</div>`;
    case "go-stats":
      return `<div class="d-go-stats">約 1,280,000 件（0.42 秒）</div>`;
    case "go-paa":
      return `<div class="d-go-paa"><b>他の人はこちらも質問</b>${["違うサイトのUIを一緒に使うと強い？", "検索窓とボタンをつなげる方法は？", "marquee タグはまだ使える？"].map((q) => `<div>${q}<span>⌄</span></div>`).join("")}</div>`;
    case "go-kp":
      return `<div class="d-go-kp"><i></i><b>UI RAID</b><small>ウェブ部品・格闘ゲーム</small><p>異なる時代・サービスのUIを1枚のページに寄せ集めて戦う。</p><dl><dt>ジャンル</dt><dd>UI合成</dd><dt>対応年代</dt><dd>1995年〜</dd></dl></div>`;
    case "ab-updates":
      return `<div class="d-ab-updates"><b>■ 更新履歴</b><table><tr><td>2001/04/01</td><td>掲示板を設置しました <em>NEW!</em></td></tr><tr><td>2000/12/24</td><td>写真館を更新</td></tr><tr><td>2000/08/10</td><td>リンク集に3件追加</td></tr><tr><td>1999/03/03</td><td>ホームページ開設</td></tr></table></div>`;
    case "ab-banners":
      return `<div class="d-ab-banners"><span class="b1">NETSCAPE<br><b>NOW!</b></span><span class="b2">Best viewed<br>800×600</span><span class="b3">LINK<br>FREE</span><span class="b4">since<br>1999</span><small>当サイトはリンクフリーです。バナーはお持ち帰りOK。</small></div>`;
    case "ab-kiriban":
      return `<div class="d-ab-kiriban"><b>★キリ番★</b><br><span>10000</span> を踏んだ方は<br>掲示板でお知らせください！<br><small>（踏み逃げ禁止）</small></div>`;
    case "ab-copyright":
      return `<div class="d-ab-copy">[<a>トップ</a>] [<a>プロフィール</a>] [<a>掲示板</a>] [<a>リンク</a>]<br>Copyright (C) 1999-2001 All Rights Reserved.</div>`;
    case "gov-sidenav":
      return `<nav class="d-gov-side"><b>くらし・手続き</b>${["戸籍・住民票", "税金", "国民健康保険", "子育て・教育", "健康・福祉", "ごみ・リサイクル", "防災・安全", "電子申請サービス"].map((t, i) => `<a class="${i === 7 ? "on" : ""}">${t}</a>`).join("")}</nav>`;
    case "gov-banners":
      return `<div class="d-gov-banners"><a><b>くらしの便利帳</b><small>2026年度版</small></a><a class="alt"><b>防災情報</b><small>避難所マップ</small></a></div>`;
    case "gov-contact":
      return `<div class="d-gov-contact"><b>このページに関するお問い合わせ</b><p>総務部 デジタル推進課　電話：000-000-0000（平日 8:30〜17:15）</p><small>ページ番号 1024-0098　更新日 2026年9月1日</small></div>`;
    default:
      return socialDecor(kind) || knowledgeDecor(kind) || communityDecor(kind) || discoveryDecor(kind) || timeMediaDecor(kind) || documentsDecor(kind) || audioDecor(kind) || qandaDecor(kind) || feedreaderDecor(kind) || marketplaceDecor(kind) || releasesDecor(kind) || rankedNewsDecor(kind) || mapSearchDecor(kind) || personalWebDecor(kind) || musicShopDecor(kind) || serviceFormDecor(kind) || projectBoardDecor(kind) || mailDecor(kind);
  }
}
export interface CreateOptions {
  side?: string;
  theme?: string;
  preview?: boolean;
}

type AppearanceRenderer = (host: HTMLElement, item: Item) => void;
let appearanceRenderer: AppearanceRenderer | null = null;
/** The app supplies a verified, local-only appearance renderer; native DOM remains underneath. */
export function setAppearanceRenderer(renderer: AppearanceRenderer | null): void {
  appearanceRenderer = renderer;
}

function create(
  p: Item,
  { side = "player", theme = "mixed", preview = false }: CreateOptions = {},
) {
  const d = D.PARTS[p.type],
    el = document.createElement("div");
  el.className = `web-node node-${p.type} layout-${d.layout} shape-${p.shape || "source"}`;
  if (p.w < 360 || p.h < 200) el.classList.add("compact-ui");
  el.dataset.id = p.id;
  el.dataset.type = p.type;
  el.dataset.side = side;
  el.dataset.kind = d.kind;
  const caption = targetCaption(p);
  el.setAttribute("aria-label", caption);
  el.setAttribute("title", caption);
  el.dataset.tag = TAGS[p.type] || "<div>";
  el.style.setProperty("--node-color", D.FACTIONS[d.faction].color);
  el.innerHTML =
    markup(p, { side, theme }) +
    '<i class="node-timing" aria-hidden="true"></i>';
  if (!preview) {
    el.tabIndex = 0;
    el.setAttribute("role", "group");
  }
  if (p.appearanceId) appearanceRenderer?.(el, p);
  return el;
}
function header(theme: string, name?: string) {
  if (theme === "portal" || theme === "storefront") return discoveryHeader(theme);
  if (theme === "webarchive" || theme === "livechannel") return timeMediaHeader(theme);
  if (theme === "documents") return documentsHeader();
  if (theme === "audio") return audioHeader();
  if (theme === "qanda") return qandaHeader();
  if (theme === "feedreader") return feedreaderHeader();
  if (theme === "marketplace") return marketplaceHeader();
  if (theme === "rankednews") return rankedNewsHeader();
  if (theme === "mapsearch") return mapSearchHeader();
  if (theme === "personalweb") return personalWebHeader();
  if (theme === "musicshop") return musicShopHeader();
  if (theme === "serviceform") return serviceFormHeader();
  if (theme === "projectboard") return projectBoardHeader();
  if (theme === "mailroom") return mailHeader();
  const avatar = '<span class="site-avatar">u</span>';
  if (theme === "twitter" || theme === "x") return socialHeader(theme);
  if (theme === "wiki" || theme === "forge") return knowledgeHeader(theme);
  if (theme === "nico" || theme === "reddit") return communityHeader(theme);
  if (theme === "youtube")
    return `<div class="site-word yt-word"><span>▶</span>YouTube<sup>UI</sup></div><div class="header-search">検索 ${icon("search")}</div><div class="site-header-end">${icon("bell")}${avatar}</div>`;
  if (theme === "amazon")
    return `<div class="site-word amazon-word">amazon<span>.ui</span><i></i></div><span class="shipping-location">お届け先<br><b>あなたの端末</b></span><div class="header-search">すべて　│　サイト内を検索 ${icon("search")}</div><div class="site-header-end">${icon("cart")} カート</div>`;
  if (theme === "google")
    return `<div class="site-word">${wordGoogle()}</div><nav>検索　画像　ニュース</nav><div class="site-header-end">${icon("grid")}${avatar}</div>`;
  if (theme === "retro")
    return `<div class="site-word classic-word">阿部寛のホームページ</div><span class="classic-sub">Hiroshi Abe's Home Page / UI motif</span>`;
  if (theme === "gov")
    return `<div class="site-word gov-word"><i>公</i><span>総合行政サービス<small>PUBLIC SERVICE / UI PROTOTYPE</small></span></div><nav>サービス一覧　｜　お問い合わせ</nav>`;
  return `<div class="site-word mix-word">${esc(name || "mixspace.")}<span class="mix-dot"></span></div><nav><a href="#" data-ui="header">ホーム</a><a href="#" data-ui="header">コレクション</a><a href="#" data-ui="header">このサイトについて</a></nav><div class="site-header-end">${icon("search")}<span class="site-avatar">m</span></div>`;
}
export interface RenderOptions {
  side?: string;
  theme?: string;
  interactive?: boolean;
  selected?: string[];
  decor?: [string, number, number, number, number][];
  lifted?: string[];
}

function render(
  host: HTMLElement,
  board: Item[],
  {
    side = "player",
    theme = "mixed",
    interactive = false,
    selected = [],
    decor = [],
    lifted = [],
  }: RenderOptions = {},
) {
  const info = C.analyze(board),
    byId = Object.fromEntries(info.board.map((p) => [p.id, p]));
  host.replaceChildren();
  host.className = "page-body " + (interactive ? "interacting" : "editing");
  host.dataset.side = side;
  for (const [kind, x, y, w, h] of decor) {
    const el = document.createElement("div");
    el.className = "page-decor decor-" + kind;
    Object.assign(el.style, {
      left: x + "px",
      top: y + "px",
      width: w + "px",
      height: h + "px",
    });
    el.innerHTML = decorMarkup(kind);
    host.append(el);
  }
  function build(
    n: (typeof info.roots)[number],
    parentBox: { x: number; y: number },
    flow = false,
  ): HTMLElement {
    let el: HTMLElement;
    if (n.kind === "part") {
      el = create(byId[n.id], { side, theme });
      if (selected.includes(n.id)) el.classList.add("is-selected");
      if (lifted.includes(n.id)) el.classList.add("is-lifted");
      el.style.width = n.box.w + "px";
      el.style.height = n.box.h + "px";
      if (n.children.length) {
        el.classList.add("has-children");
        const slot = el.querySelector(".container-slot");
        if (slot)
          for (const child of n.children)
            slot.append(build(child, n.box, false));
      }
    } else {
      el = document.createElement(n.kind.startsWith("nav") ? "nav" : "div");
      el.className = "ui-composite composite-" + n.kind;
      el.dataset.group = n.id;
      el.dataset.composition = n.kind;
      el.setAttribute("role", "group");
      el.setAttribute(
        "aria-label",
        Object.entries(E.groupNames).find(([kind]) => kind === n.kind)?.[1] ??
          n.kind,
      );
      el.style.width = n.box.w + "px";
      el.style.height = n.box.h + "px";
      const isRow = ["button-group", "search-form", "nav-row"].includes(n.kind),
        isColumn = n.kind === "nav-menu" || n.kind.endsWith("stack");
      el.classList.add(isRow ? "flow-row" : "flow-column");
      let lastEnd = isRow ? n.box.x : n.box.y;
      for (const child of n.children) {
        const c = build(child, n.box, true),
          start = isRow ? child.box.x : child.box.y,
          gap = Math.max(0, start - lastEnd);
        if (gap) c.style[isRow ? "marginLeft" : "marginTop"] = gap + "px";
        if (isColumn && child.box.x !== n.box.x)
          c.style.marginLeft = child.box.x - n.box.x + "px";
        el.append(c);
        lastEnd = start + (isRow ? child.box.w : child.box.h);
      }
    }
    if (!flow) {
      el.style.position = "absolute";
      el.style.left = n.box.x - parentBox.x + "px";
      el.style.top = n.box.y - parentBox.y + "px";
    } else {
      el.style.position = "relative";
      el.style.flexShrink = "0";
    }
    return el;
  }
  for (const n of info.roots) host.append(build(n, { x: 0, y: 0 }));
  // In edit mode the root receives keyboard focus; native controls are live in preview.
  for (const child of host.querySelectorAll<HTMLElement>(
    "button,input,select,a",
  ))
    child.tabIndex = interactive ? 0 : -1;
  return info;
}
function palettePreview(type: string) {
  const d = D.PARTS[type],
    p = C.makeItem(type, "preview", 0, 0),
    el = create(p, { preview: true });
  el.style.width = d.w + "px";
  el.style.height = d.h + "px";
  return el;
}
export default {
  esc,
  icon,
  markup,
  setAppearanceRenderer,
  create,
  header,
  render,
  palettePreview,
  wordGoogle,
};
