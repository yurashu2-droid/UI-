import type { SiteTemplate } from "./types.js";
import { RELEASE_TEMPLATES } from "./releases-templates.js";

/** Ordinary editing coordinates, not a new action, target override or service feature. */
export const RELEASE_CACHE_POSITIONS = {
  zip: { x: 648, y: 300 },
  pdf: { x: 552, y: 456 },
  detached: { x: 648, y: 456 },
} as const;

const base = structuredClone(RELEASE_TEMPLATES[0]);

/**
 * Isolated replacement for the existing Releases entry, never an appended template.
 * Default native identities, labels, geometry, rewards and administrators are unchanged.
 */
export const RELEASE_PROTECTION_TEMPLATES: SiteTemplate[] = [{
  ...base,
  tip: "同じ4部品・$24・CPU10で、キャッシュ1個だけを移動。初期(648,300)はZIP、(552,456)はPDFを守り、(648,456)は未接続。妨害を防いだ回数と、実際の与ダメージ・再発動を分けて見比べます。キャッシュはゲーム内の標準UIです。",
  counterplay: "キャッシュは近接する攻撃1つだけを保護し、次のポップアップを1回防ぐ。初期チャージ1・基本8秒で再充填。妨害側の対象選びは変わらず、この構成ではZIPが狙われる。CPU10以上・追加補正なしのZIP初回は4秒、コミットの最初の再利用は10.5秒。保護は原本を作らず、通常転送も再発動も別の時計で動く。通常combat-v4・双方HP10,000/CPU12・設備なし・0.05秒刻みの24秒測定では、$15/CPU4のnewsletter+popupに対してZIP保護/PDF保護は192/192ダメージ、7/7通常攻撃、2/2再発動。2/0回防いでも出力は増えない。合法なform+newsletter+popup（$20/CPU7）では157/135ダメージ、2/1再発動だが、相手の初回時計を0.75秒遅らせる診断では157/157へ変わる。どちらも未決着の測定で、相手・位相・観測時間による。CPU8は初期12より低い診断条件で、通常popupに対し配置162/収納192ダメージ。配置のCPU2は1.15倍の遅延と24秒で21.6HPの過負荷損失を生み、収納は部品や代金を返さない。HP440/CPU12ではZIP保護・PDF保護・未接続の全てが、より安い$17/CPU5の文字強化付き4リンクに両席で21.15秒敗北する。回復・シールド・収益はなく、3つの試作UIを含む。価格は素材額面で有償入手経路の証明ではない。キャッシュはGitHubの保存やファイル取得を実行しない。",
  decor: [
    ...base.decor.filter(([kind]) => ![
      "release-cache-note", "release-pdf-meta", "release-disclaimer", "release-previous",
    ].includes(kind)),
    ["release-protection-cache-note", 648, 356, 288, 56],
    ["release-protection-lesson", 216, 516, 720, 96],
    ["release-protection-footer", 24, 624, 912, 48],
  ],
}];
