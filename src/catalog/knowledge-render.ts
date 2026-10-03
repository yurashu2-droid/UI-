import { transferPartMarkup } from "./transfer-render.js";
import type { Item } from "../types.js";

const escape = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const label = (p: Item, fallback: string) => escape(p.label || fallback);

export function knowledgePartMarkup(p: Item): string {
  switch (p.type) {
    case "gh_transfer": return transferPartMarkup(p.label || "web-parts.zip");
    case "wk_article": return `<article class="native-wiki-article"><h2>${label(p, "ウェブ部品とは")}<small>[編集]</small></h2><p><b>ウェブ部品</b>は、ページを構成する小さな操作の単位である。検索窓、リンク、動画などがあり、配置と接続によって働きが変わる。<sup>[1]</sup></p><p>異なる時代の部品も、ひとつのページで使うことができる。<sup>[2]</sup></p></article>`;
    case "wk_reference": return `<section class="native-wiki-references"><ol><li><a href="#" data-ui="reference">${label(p, "小さなページのつなぎ方")}</a><span>ウェブ部品研究会.</span></li><li><span>閲覧日：2026年10月2日.</span><small class="reference-state">原本を参照</small></li></ol></section>`;
    case "wk_infobox": return `<section class="native-wiki-infobox"><h3>${label(p, "ウェブ部品")}</h3><div class="infobox-illustration" aria-hidden="true"><i></i><span>UI</span><i></i></div><div class="empty-container"><dl><dt>分類</dt><dd>ページの構成要素</dd><dt>用途</dt><dd>検索・表示・接続</dd><dt>特徴</dt><dd>配置による連携</dd></dl><small>小さな文字UIをここに内包できます</small></div><div class="container-slot"></div></section>`;
    case "gh_diff": return `<section class="native-code-diff"><header><span>▾</span><b>${label(p, "src/page.ts")}</b><small><i>+4</i><em>−2</em></small></header><div class="diff-hunk">@@ -12,6 +12,8 @@ createPage()</div>${[
      ["context", "12", "12", "  const page = new Page();"],
      ["remove", "13", "", "- page.stack(parts);"],
      ["remove", "14", "", "- page.leaveGaps();"],
      ["add", "", "13", "+ page.connect(search, button);"],
      ["add", "", "14", "+ page.keep(originalStyles);"],
      ["add", "", "15", "+ page.saveSources();"],
      ["context", "15", "16", "  return page.publish();"],
    ].map(([kind, before, after, code]) => `<div class="diff-line diff-${kind}"><span>${before}</span><span>${after}</span><code>${escape(code)}</code></div>`).join("")}</section>`;
    case "gh_commit": return `<div class="native-commit"><i aria-hidden="true">m</i><b>${label(p, "ページの導線を整理する")}</b><span class="commit-state">最後の変更を待機</span><code>c0ffee1</code></div>`;
    case "gh_checks": return `<section class="native-checks"><header><b aria-hidden="true">✓</b><strong>${label(p, "チェック結果")}</strong></header><div><i>✓</i><span>layout / valid</span><small>pass</small></div><div><i>✓</i><span>links / connected</span><small>pass</small></div><footer class="checks-state">ローカル模擬チェック · 外部実行なし</footer></section>`;
    default: return "";
  }
}

export function knowledgeHeader(theme: string): string {
  if (theme === "wiki") return `<div class="wiki-word"><i aria-hidden="true">P</i><span>ページ百科<small>Wikipedia風 · 非公式UIモチーフ</small></span></div><div class="wiki-search">ページ百科を検索<span>検索</span></div><nav><span>アカウント作成</span><span>ログイン</span></nav>`;
  if (theme === "forge") return `<div class="forge-word"><i aria-hidden="true">&lt;&gt;</i><span>patch.garden<small>GitHub風 · 非公式UIモチーフ</small></span></div><div class="forge-search">Type / to search</div><nav><span>＋</span><span>◯</span><span>▣</span></nav>`;
  return "";
}

export function knowledgeDecor(kind: string): string {
  switch (kind) {
    case "wiki-title": return `<div class="wiki-article-title"><h1>ウェブ部品</h1><span>12言語 ▾</span></div>`;
    case "wiki-tabs": return `<div class="wiki-article-tabs"><b>ページ</b><span>ノート</span><i></i><b>閲覧</b><span>編集</span><span>履歴表示</span><span>ツール ▾</span></div>`;
    case "wiki-contents": return `<nav class="wiki-contents"><b>目次 <small>非表示</small></b><p>はじめに</p><p>1　ウェブ部品とは</p><p>2　構造と意味</p><p>3　関連する技術</p><p>4　脚注</p><p>5　外部リンク</p><small>読みたい節へ移動</small></nav>`;
    case "wiki-appearance": return `<aside class="wiki-appearance"><b>外観 <small>非表示</small></b><h4>文字サイズ</h4><p>◯ 小　 ◉ 標準　 ◯ 大</p><h4>横幅</h4><p>◉ 標準　 ◯ 広め</p><h4>色</h4><p>◉ 明るい　 ◯ 自動</p><small>ここは表示用の架空設定です</small></aside>`;
    case "wiki-section": return `<div class="wiki-section-title">構造と意味 <small>[編集]</small></div>`;
    case "wiki-related": return `<aside class="wiki-related"><b>関連項目</b><p>ハイパーリンク</p><p>ユーザーインターフェース</p><small>架空の記事・出典です</small></aside>`;
    case "forge-tabs": return `<nav class="forge-repo-tabs"><b>⌘ Code</b><span>◯ Issues <i>3</i></span><span>⑂ Pull requests <i>1</i></span><span>▷ Actions</span><span>▦ Projects</span><span>▤ Wiki</span><em>☆ Star 128</em></nav>`;
    case "forge-pr-title": return `<div class="forge-pr-title"><h1>ページの余白を、意味のある導線へ <span>#128</span></h1><p><b>⑂ Open</b><span>mori wants to merge 2 commits into <code>main</code> from <code>connect-ui</code></span></p></div>`;
    case "forge-reviewers": return `<aside class="forge-repo-aside"><h3>Reviewers</h3><p>●　page-builder <span>✓</span></p><h3>Assignees</h3><p>●　mori</p><h3>Labels</h3><b class="forge-label">enhancement</b><b class="forge-label alt">ui</b><h3>Projects</h3><p>Web parts collection</p></aside>`;
    case "forge-about": return `<aside class="forge-repo-aside forge-about"><h3>About this change</h3><p>Small parts. Connected pages.</p><div><i></i><b></b></div><small>● TypeScript 72%　● CSS 28%</small><p class="forge-disclaimer">架空の差分・チェックです。<br>実際のコミットや送信は行いません。</p></aside>`;
    default: return "";
  }
}
