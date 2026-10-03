/** Original notebook chrome; no page tree, sync, verification or editing service. */
export function notebookHeader(): string {
  return '<div class="notebook-word"><i aria-hidden="true">▱</i><span>LEAFNOTE<small>Notion風 · 非公式UIモチーフ</small></span></div><span class="notebook-header-context">小さなWebのノート</span><span class="notebook-header-local">架空のwiki Home · 固定の見本</span>';
}

export function notebookDecor(kind: string): string {
  switch (kind) {
    case "notebook-rail-top": return '<aside class="notebook-rail-top"><h2><i aria-hidden="true">▱</i>余白のノート</h2><p>架空のワークスペース</p><div class="notebook-rail-sample"><span>最近のページ</span><span>お気に入り</span><small>固定の一覧 · 操作なし</small></div><h3>ページの入口 <small>下の2本はUI</small></h3></aside>';
    case "notebook-rail-note": return '<section class="notebook-rail-note"><b>初期の並び / 固定説明</b><p>青いリンクが縦に2本。<br>この並びは本当のナビで、<br>2本とも15%速くなります。</p><p>2本目だけを、下の棚へ。<br>所持品も値段も同じです。</p></section>';
    case "notebook-shelf-caption": return '<div class="notebook-shelf-caption"><h3>あとで読む棚</h3><p>移動先：x 24 / y 520</p><small>見本の棚 · 内包枠ではありません</small></div>';
    case "notebook-shelf-note": return '<p class="notebook-shelf-note">ここへ移すと、縦ナビは解消。<br>青リンクの余白強調の2枠目が<br>本文へ移ります。</p>';
    case "notebook-breadcrumb": return '<div class="notebook-breadcrumb"><span>余白のノート</span><i aria-hidden="true">/</i><b>つくるためのノート</b><small>道順は固定表示</small></div>';
    case "notebook-title": return '<header class="notebook-title"><span class="notebook-page-icon" aria-hidden="true">▱</span><div><small>SMALL WEB / FIELD NOTES</small><h1>つくるためのノート</h1><p>思いついたことを、小さな入口からつないでいく。</p></div></header>';
    case "notebook-callout": return '<aside class="notebook-callout"><span aria-hidden="true">✳</span><div><b>ひとつの余白を、どの入口へ渡す？</b><p>このページで動くのは、3本の青いリンクと文字サイズのUI。<br>見出し・案内・目次は固定のノートです。背景に戦闘効果はありません。</p></div></aside>';
    case "notebook-section": return '<h2 class="notebook-section"><span aria-hidden="true">01</span>読むと試す</h2>';
    case "notebook-reading-note": return '<section class="notebook-reading-note"><h3>本文の入口 / 固定説明</h3><p>上の文字サイズUIが、このリンクを50%強化。<br>初期は 4 × 1.5 = <b>6</b> ダメージです。</p><p>左の2本目を下へ移すと、余白の +3 が届き、<br>(4 + 3) × 1.5 = <b>10.5</b> になります。</p><small>移したリンクは 7 → 4。ナビの加速も失います。</small></section>';
    case "notebook-index": return '<aside class="notebook-index"><h2>このノートの見出し <small>固定目次</small></h2><ol><li>ページの入口</li><li class="notebook-index-active">読むと試す</li><li>あとで読む棚</li></ol><div class="notebook-index-rule"></div><h3>同じ材料で並べ替える</h3><p>4 UI · $14 · CPU4<br>占有面積：28,832px²</p><small>余白の強調は、青リンクの先頭2本。<br>ページ全体の上から下、同じ高さなら<br>左から右の順です。<br>レトロ3個の15%加速は両配置に残ります。</small></aside>';
    case "notebook-comparison": return '<section class="notebook-comparison"><div><h2>速い入口と、大きな一撃</h2><p>固定24秒：空の相手へ 342 → 322.5<br>同じ条件で429があると 138 → 142.5</p></div><div><b>HP10,000 · CPU12 · 設備なしの測定</b><p>6.7秒の429例は両方38。時刻や相手で変わります。<br>429に強い完成形ではなく、配分を比べる見本です。</p></div></section>';
    case "notebook-local-note": return '<p class="notebook-local-note">外部への共有・同期・送信なし。<br>青リンクと文字サイズの操作も、<br>このゲーム内の表示プレビューです。</p>';
    default: return "";
  }
}
