/** Original fixed instructional chrome. Native controls remain in components.ts. */
export function redditSidebarDecor(kind: string): string {
  switch (kind) {
    case "reddit-sidebar-title": return `<p class="reddit-sidebar-title">自分用の別教材 / 青リンク1本を移して、返信とサイドバーを比べる</p>`;
    case "reddit-sidebar-thread-note": return `<p class="reddit-sidebar-thread-note">返信の中：投稿＋青リンクの2種類。投票と出典は、文字攻撃の種類に数えません。</p>`;
    case "reddit-sidebar-lesson": return `<aside class="reddit-sidebar-lesson"><h2>1本のリンク、2つの役割</h2><p>同じ8部品・素材額面$34・CPU14</p><p>初期：返信の中 (100,492)</p><p>直接の文字攻撃は投稿＋リンク</p><p>回復12、出典の原本にもなる</p><p>移動先：右の棚 (692,492)</p><p>文字サイズでリンクが6→9</p><p>返信は回復8、出典は原本なし</p><p>双方HP10,000・CPU14・設備なし</p><p>差分1つを相手に24秒、0.05秒刻み</p><p>初期：与ダメージ286.4 / 回復48</p><p>移動：与ダメージ317 / 回復32</p><p>CPU12では遅延1.1倍、過負荷あり</p><p>条件付きの測定。勝利保証なし</p></aside>`;
    case "reddit-sidebar-font-seat": return `<p class="reddit-sidebar-font-seat">関連資料の棚 / 下にリンクを置く</p>`;
    case "reddit-sidebar-reading-note": return `<p class="reddit-sidebar-reading-note">↑ (692,492) 文字強化、返信の外</p>`;
    case "reddit-sidebar-detached-note": return `<p class="reddit-sidebar-detached-note">↑ (692,552) は強化にも未接続<br>リンクを初期位置へ戻した別案：<br>文字サイズだけ(316,492)へ移動<br>同条件で357.8ダメージ・48回復</p>`;
    case "reddit-sidebar-footnote": return `<p class="reddit-sidebar-footnote">実験室の配置教材。投稿・投票・外部送信はしません。元のReddit対戦相手は変更せず、有償入手の保証もありません。</p>`;
    default: return "";
  }
}
