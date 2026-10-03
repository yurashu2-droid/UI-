/** Original, inert design-tool artwork. These panels never inspect or mutate a file. */
export function designCanvasHeader(): string {
  return '<div class="canvas-word"><i aria-hidden="true">▧</i><span>FRAMESET<small>Figma風 · 非公式UIモチーフ</small></span></div><span class="canvas-file-name">練習ファイル / 入れ子の資料棚</span><span class="canvas-header-local">架空の編集画面 · 固定の見本</span>';
}

export function designCanvasDecor(kind: string): string {
  switch (kind) {
    case "canvas-layers": return '<aside class="canvas-panel canvas-layers"><div class="canvas-panel-tabs"><b>レイヤー</b><span>素材</span></div><h2>ページ</h2><p class="canvas-page-row"><i aria-hidden="true">◇</i>入れ子の資料棚</p><h2>初期の構成 <small>固定見本</small></h2><ol class="canvas-layer-tree"><li><span>▾</span>外側 / 申請枠<ol><li><span>▾</span>内側 / table<ol><li><span>▧</span>PDF</li></ol></li></ol></li></ol><p class="canvas-panel-note">この一覧は初期配置の見本。<br>移動後の親や接続は、<br>ゲームの選択欄で確認します。</p><div class="canvas-panel-divider"></div><h2>この標本の予算</h2><dl class="canvas-costs"><div><dt>部品</dt><dd>3 UI</dd></div><div><dt>取得相当</dt><dd>$16</dd></div><div><dt>CPU負荷</dt><dd>8 / 12</dd></div></dl><p class="canvas-panel-note">外側の枠も部品です。<br>紙の中へ重ねても、<br>CPUは消えません。</p><span class="canvas-panel-foot">01 / 親子関係の練習</span></aside>';
    case "canvas-workspace": return '<div class="canvas-workspace"><span>DESIGN STUDY / 01</span><small>上の余白へPDFを離すと、親なし</small></div>';
    case "canvas-frame-caption": return '<div class="canvas-frame-caption"><b>▧ 資料棚 / 外側の申請枠</b><span>480 × 368 · 既存のUI標本</span></div>';
    case "canvas-properties": return '<aside class="canvas-panel canvas-properties"><div class="canvas-panel-tabs"><b>デザイン</b><span>見本</span></div><h2>配置の比較 <small>固定説明</small></h2><section class="canvas-property-section"><h3><i>A</i>tableの中</h3><p>PDFの直接の親はtable。<br>tableのシールド：4 → 7<br>PDFの速度：通常のまま</p><small>外側フォームの加速は届きません</small></section><section class="canvas-property-section"><h3><i>B</i>外側フォームへ</h3><p>PDFだけを下の空き場所へ。<br>配置例：x 260 / y 412<br>PDFの速度：+20%<br>tableのシールド：7 → 4</p><small>table自身は両方で20%加速</small></section><section class="canvas-property-section"><h3>PDFに残る性質</h3><p>1回18ダメージ・50%貫通。<br>親を替えても一撃は同じ。<br>どちらも回復と収益はなし。</p></section><section class="canvas-property-section canvas-caution"><h3>広い枠の代金</h3><p>外側：$5 / CPU3<br>内側：$4 / CPU2<br>PDF：$7 / CPU3</p><small>枠を外せば、保護や加速も失います</small></section></aside>';
    case "canvas-lesson": return '<section class="canvas-lesson"><h2>直接の親を選ぶと、働き方が変わる</h2><p>内側のtable：文字の子を受け入れ、シールドを増やす。<br>外側のフォーム：PDFを直接受け入れ、発動を速める。<br>入れ子でも加速は二重にならず、占有面積とCPUは同じ。<br>シールド上限は60。背景・左右の欄・ツール列は固定表示。</p></section>';
    case "canvas-tools": return '<div class="canvas-tools"><span aria-hidden="true">↖</span><span aria-hidden="true">▧</span><span aria-hidden="true">□</span><span aria-hidden="true">T</span><span aria-hidden="true">✎</span><small>ツール列は見本</small></div>';
    case "canvas-local-note": return '<p class="canvas-local-note">外部ファイルへ保存・同期しません。<br>PDFもページ内プレビューです。</p>';
    case "canvas-status": return '<p class="canvas-status">背景の点や枠の選択色に効果はありません。<br>実際の移動にはゲームの編集操作を使います。</p>';
    default: return "";
  }
}
