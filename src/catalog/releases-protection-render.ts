/** Original fixed teaching copy. Existing release chrome and native controls render separately. */
export function releasesProtectionDecor(kind: string): string {
  switch (kind) {
    case "release-protection-cache-note":
      return '<aside class="release-protection-cache-note"><b>保護は1つだけ</b><p>初期はZIP。再充填は基本8秒。<br>保護しても、原本の初回転送は待ちます。</p></aside>';
    case "release-protection-lesson":
      return '<section class="release-protection-lesson"><p>キャッシュだけ移動：ZIP (648,300) ／ PDF (552,456) ／ 未接続 (648,456)</p><p>同じ4部品・$24・CPU10。通常combat-v4・24秒・双方HP10,000/CPU12・設備なし。</p><p>通常の妨害例（相手$15/CPU4）は192→192。2回防いでも、与ダメージは増えません。</p><p>加速した妨害例（相手$20/CPU7）は157→135、再発動2→1。開始位相で差が消えます。</p><p>比較はZIP保護→PDF保護。原本の初回4秒、再利用10.5秒。保護は原本を作りません。</p><p>CPU8診断は配置162／収納192。配置はCPU2を使い、収納しても所有・代金は残ります。</p></section>';
    case "release-protection-footer":
      return '<aside class="release-protection-footer"><p>キャッシュはゲーム内の妨害対策です。GitHubの保存機能ではなく、実ファイルの取得・送信は行いません。</p><p>数値は固定条件の未決着測定。万能な対策や通常ショップの入手保証ではありません。固定の説明は配置に追従しません。</p><p>既存のZIP・PDF・コミット・キャッシュをそのまま使用。同じGitHub系UIを3個置いても追加セット補正はありません。</p></aside>';
    default:
      return "";
  }
}
