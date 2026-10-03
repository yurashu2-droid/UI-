/** Original, inert board chrome. All real controls retain their canonical markup. */
export function projectBoardHeader(): string {
  return '<div class="project-board-word"><i aria-hidden="true"><b></b><b></b><b></b></i><span>PATCHBOARD<small>Trello風 · 非公式UIモチーフ</small></span></div><span class="project-board-workspace">小さなWeb制作室</span><span class="project-board-private">架空のワークスペース</span>';
}

function lane(name: string, status: string, color: string): string {
  return `<div class="project-lane-heading"><i class="project-status-${color}" aria-hidden="true"></i><h2>${name}</h2><span>${status} · 固定見本</span></div>`;
}

function card(tag: string, title: string, detail: string, color: string): string {
  return `<article class="project-card-heading"><span class="project-label project-status-${color}">${tag}</span><h3>${title}</h3><p>${detail}</p></article>`;
}

export function projectBoardDecor(kind: string): string {
  switch (kind) {
    case "board-toolbar": return '<header class="project-board-toolbar"><div><h1>小さなホームページをつくる</h1><p>制作ボードの見本 · ネイティブUIを自由に配置</p></div><span class="project-board-view">▥ ボード表示</span><span class="project-board-avatar" aria-label="架空の制作者">m</span></header>';
    case "board-lane-idea": return lane("準備する", "TO DO", "blue");
    case "board-lane-progress": return lane("つくる", "IN PROGRESS", "amber");
    case "board-lane-done": return lane("確かめる", "REVIEW", "green");
    case "board-card-brief": return card("資料", "画面の要件を読む", "添付ファイルと、その出典を並べる", "blue");
    case "board-card-build": return card("制作", "ページ同士をつなぐ", "実際のリンクと、操作できるチェック欄", "amber");
    case "board-card-check": return card("確認", "小さな変更を見直す", "既存のチェック結果UIをそのまま配置", "green");
    case "board-attachment-note": return '<aside class="project-board-note"><b>出典は、ひとつの原本を参照</b><p>PDFの通常発動が先に必要です。<br>出典を中央のリンク直下へ動かすと、<br>再発動の対象も変わります。</p><small>右下の空き場所では原本がなく待機。</small></aside>';
    case "board-checkbox-note": return '<p class="project-board-caption">チェックはページ内の操作プレビュー。<br>列の進捗や戦闘能力は切り替わりません。<br>中央のリンク直下は、出典を動かせる余白です。</p>';
    case "board-checks-note": return '<p class="project-board-caption">模擬チェックのシールドはページ全体へ。<br>この列だけを守る専用の壁ではありません。<br>実際のビルドや公開処理は実行しません。</p>';
    case "board-lesson": return '<section class="project-board-lesson"><b>見た目の列と、本当の接続は別</b><p>列やカード名は固定の表示です。ゲームの編集操作で動くのは、選んだネイティブUI。<br>背景の列は親枠にならず、戦闘の接続は部品同士の実際の距離で決まります。</p><span>5 UI<br>$23 / CPU 8</span></section>';
    case "board-local-note": return '<p class="project-board-local-note">ローカルの架空ボード · 外部のタスクとは同期しません · 添付は見本、リンクと出典はページ内プレビュー</p>';
    default: return "";
  }
}
