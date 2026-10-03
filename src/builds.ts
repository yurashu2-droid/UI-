import {
  nativeFortressCandidate,
  heavyDocumentCandidate,
  videoCheckoutCandidate,
} from "./balance-candidates.js";
import type { Faction, LayoutEntry, Theme } from "./types.js";

/* Archetype showcase: the "ideal form" of each build, hand-laid so that every synergy the engine
   knows about actually connects. Loadable as a lab preset and fightable as a lab opponent. */

export interface BuildDef {
  id: string;
  name: string;
  /** Main faction (frame era, loot colour). */
  faction: Faction;
  theme: Theme;
  pageName: string;
  address: string;
  /** One-line pitch. */
  concept: string;
  /** How the synergies connect, in play order. */
  how: string[];
  /** What beats it. */
  weakness: string;
  admin: string[];
  /** False keeps a new player preset out of the legacy numeric opponent list. */
  labOpponent?: boolean;
  layout: LayoutEntry[];
}

export const BUILDS: BuildDef[] = [
  {
    id: "b_video",
    name: "【理想形】バズ動画",
    faction: "youtube",
    theme: "youtube",
    pageName: "バズ動画チャンネル",
    address: "archive://build/video-engine",
    concept:
      "動画プレイヤーに操作列を“一体化”させ、2×・字幕・自動再生をすべて動画本体へ届ける。",
    how: [
      "動画の直下にシークバー → その下に操作ボタン列を隙間なく連結すると「動画プレイヤー」になる",
      "一体化したUIは互いに“近接”扱い。2× 再生速度が動画にも届き、再生間隔が半分に",
      "字幕で25%貫通、シークバーで威力+25%、YouTube 3個以上で動画威力+15%",
      "自動再生は通常発動済みの動画を45%威力で再現。コピーは成長や広告収益を追加発生させない",
    ],
    weakness:
      "面積とCPUを使い、火力が動画2本に集中する。ポップアップ対策にキャッシュを採用すると、攻撃・防御の置き場を譲る。",
    admin: ["sns", "cdn", "backup", "adnet"],
    layout: [
      ["yt_play", 24, 24, 600, 300],
      ["yt_progress", 24, 324, 600, 22],
      ["yt_speed", 24, 346, 104, 40],
      ["yt_autoplay", 128, 346, 176, 40],
      ["yt_caption", 304, 346, 88, 40],
      ["yt_like", 392, 346, 112, 40],
      ["yt_notify", 504, 346, 72, 40],
      ["yt_ad", 24, 394, 600, 64],
      ["yt_play", 648, 24, 288, 162],
      ["yt_progress", 648, 186, 288, 22],
      ["yt_speed", 648, 208, 104, 40],
      ["yt_like", 752, 208, 112, 40],
      ["yt_notify", 864, 208, 72, 40],
      ["yt_sub", 648, 256, 288, 40],
    ],
  },
  {
    id: "b_cart",
    name: "【理想形】セール砲台",
    faction: "amazon",
    theme: "amazon",
    pageName: "mixstore. タイムセール",
    address: "archive://build/cart-economy",
    concept:
      "収益が出るたびカートが撃つ。“稼ぐ”と“殴る”を同じ動きにする経済エンジン。",
    how: [
      "セール・クーポンは商品の隣で収益化。各収益は選ばれたカート1つへ届き、チャージ$3を15ダメージへ変換。生涯収益は残るが同じチャージは二重使用できない",
      "動画＋広告もカートの隣へ。再生のたびに$1 → 広告ネットワークで×1.5、Amazon 3個以上で毎秒+1",
      "商品の直下に 数量・今すぐ買う・Prime のボタン列 →「商品購入欄」で購入ボタン+20%、Primeで1.5倍速",
      "今すぐ買うは戦闘収益$5ごとに威力+1（最大+8）。稼ぐほど通常攻撃も重くなる",
    ],
    weakness:
      "商品・購入ボタン・動画・変換先をそろえた完成形は立ち上がりも速い。完成前の素材費とCPU負担が大きく、収益の接続が欠けると火力が落ちる。",
    admin: ["adnet", "server", "cdn", "backup"],
    layout: [
      ["am_product", 24, 24, 560, 300],
      ["am_quantity", 24, 324, 112, 40],
      ["am_buy", 136, 324, 168, 40, null, "今すぐ買う"],
      ["am_prime", 304, 324, 144, 40],
      ["am_wish", 448, 324, 136, 40],
      ["am_rating", 24, 372, 560, 32],
      ["am_deal", 608, 24, 328, 52],
      ["am_coupon", 608, 84, 328, 36],
      ["am_cart", 608, 128, 328, 100],
      ["yt_ad", 608, 236, 328, 80],
      ["yt_play", 608, 324, 328, 184],
      ["yt_speed", 608, 508, 104, 40],
      ["am_cart", 24, 412, 560, 100],
    ],
  },
  {
    id: "b_text",
    name: "【理想形】文字砲台",
    faction: "google",
    theme: "google",
    pageName: "検索と申請のポータル",
    address: "archive://build/text-artillery",
    concept:
      "文字UIの強化を何重にも重ねて、1発を倍率上限（3倍）近くまで押し上げる。",
    how: [
      "検索窓・音声・I'm Feeling Lucky を横に連結 →「検索フォーム」で全員威力+30%",
      "フォームの直下にサジェスト →「検索パネル」になり、パネル全体と隣接する文字攻撃が+40%",
      "行政の文字サイズ（+50%）、翻訳（別サイトの文字+25%）を見出しとPDFに隣接させる",
      "検索タブで検索系を20%加速。ページ送りはLuckyの最後の通常攻撃を50%で再現。3発目の成長回数は増やさない",
    ],
    weakness:
      "文字強化に費用を集中し、部品による回復は無い。CAPTCHAは荒らしを防ぐが、通常攻撃やポップアップは防がない。",
    admin: ["captcha", "cdn", "server", "moderator"],
    layout: [
      ["gov_font", 24, 0, 232, 36],
      ["go_tabs", 264, 0, 440, 36],
      ["go_search", 24, 40, 420, 44],
      ["go_voice", 444, 40, 72, 44],
      ["go_lucky", 516, 40, 184, 44],
      ["go_suggest", 24, 84, 420, 84],
      ["go_page", 452, 92, 320, 36],
      ["ab_heading", 24, 184, 576, 56, null, "UIを奪う10の方法"],
      ["go_translate", 608, 184, 184, 40],
      ["gov_font", 24, 248, 232, 36],
      ["gov_pdf", 264, 248, 336, 48],
      ["go_result", 24, 304, 576, 96],
    ],
  },
  {
    id: "b_links",
    name: "【理想形】余白の美学",
    faction: "retro",
    theme: "retro",
    pageName: "余白の多いリンク集",
    address: "archive://build/whitespace-links",
    concept:
      "青リンクは余白が多いほど強い。軽いリンクの列にリツイートとお気に入りをつなぎ、手数を支える。",
    how: [
      "リンクを縦に隙間なく並べると「縦ナビ」で速度+15%。古い個人サイト3個以上でさらに+15%。攻撃ナビが6個を超えると1個ごとに発動間隔が基準の5%ずつ延び、注目が分散する",
      "ページの余白率が60%以上なら、画面の上・左から先頭2本の青リンクが威力+3（4→7）。余白強調はページ全体で共有する",
      "動画専用の2×には頼らない。リツイートは発動済みのリンクを35%で再現し、お気に入りがシールドを補う",
      "アクセスカウンターが発動を数えて収益化。流れる文字が右隣のリンクを追加発動",
    ],
    weakness:
      "貫通がなく、回復は管理設備頼み。相手に合わせて防御へ替えると手数が減る。CDNは大きい攻撃にも同じ割合で効く。",
    admin: ["troll", "sns", "cdn", "backup"],
    layout: [
      ["ab_link", 40, 40, 192, 32, null, "最新情報"],
      ["ab_nav", 40, 72, 192, 32, null, "プロフィール"],
      ["ab_link", 40, 104, 192, 32, null, "日記"],
      ["ab_nav", 40, 136, 192, 32, null, "写真館"],
      ["ab_link", 40, 168, 192, 32, null, "リンク集"],
      ["ab_nav", 40, 200, 192, 32, null, "掲示板"],
      ["tw_retweet", 240, 40, 128, 32],
      ["tw_favorite", 240, 80, 128, 32],
      ["ab_link", 376, 40, 192, 32, null, "相互リンク"],
      ["ab_nav", 376, 72, 192, 32, null, "キリ番"],
      ["ab_link", 376, 104, 192, 32, null, "素材"],
      ["ab_nav", 376, 136, 192, 32, null, "更新履歴"],
      ["ab_link", 376, 168, 192, 32, null, "サイトマップ"],
      ["ab_nav", 376, 200, 192, 32, null, "メール"],
      ["ab_counter", 40, 240, 528, 26],
      ["ab_marquee", 40, 8, 528, 28],
    ],
  },
  {
    id: "b_fort",
    name: "【理想形】お役所要塞",
    faction: "gov",
    theme: "gov",
    pageName: "電子申請 総合窓口",
    address: "archive://build/gov-fortress",
    concept:
      "シールドと回復に投資して被害を抑える。45秒以降の共通過負荷はシールドで止められないため、攻撃も必要。",
    how: [
      "申請フォームの中に チェック・送信・PDF を入れると全員20%加速。送信は発動ごとに$1",
      "行政サイト3個以上で開始シールド+12。表組みの中に文字UIを入れるとシールド+3",
      "お知らせは近くに書類があると回復+2。案内枠と掲示板で回復を重ねる",
      "管理画面：サーバー増強でHP+25%、モデレーターで4秒ごとシールド+6、バックアップで1回復活",
    ],
    weakness:
      "火力が低く、長期戦になる。シールドを無視する貫通や、同じく耐える相手には決め手が無い。",
    admin: ["moderator", "server", "backup", "cdn"],
    layout: [
      ["gov_breadcrumb", 24, 0, 912, 28],
      ["gov_form", 24, 36, 440, 380],
      ["gov_check", 40, 92, 232, 32],
      ["gov_check", 40, 132, 232, 32],
      ["gov_submit", 40, 172, 184, 40],
      ["gov_pdf", 40, 220, 408, 48],
      ["gov_pdf", 40, 276, 408, 48, null, "様式第2号"],
      ["gov_submit", 232, 172, 184, 40, null, "確認する"],
      ["gov_notice", 24, 424, 560, 56],
      ["gov_accordion", 472, 36, 328, 200],
      ["ab_table", 472, 244, 328, 172],
      ["ab_heading", 484, 290, 304, 56, null, "お知らせ"],
      ["ab_hr", 24, 488, 560, 16],
      ["ab_guestbook", 592, 424, 344, 132],
      ["gov_page", 24, 512, 280, 36],
    ],
  },
  {
    id: "b_echo",
    name: "【理想形】再放送",
    faction: "gov",
    theme: "mixed",
    pageName: "再放送アーカイブ",
    address: "archive://build/echo-chamber",
    concept:
      "一番重い一撃（PDF）に“再発動UI”を3種類集め、同じ一撃を何度も撃ち直す。",
    how: [
      "PDFは18ダメージ・半分貫通。文字サイズ+50%、サジェスト+40%で1発が約38に",
      "流れる文字（直下の攻撃を55%）、検索のページ送り（文字を50%）、行政のページ送り（書類を45%）が同じPDFを再発動",
      "各PDFの横にキャッシュを置き、次のポップアップを1回防ぐ。再発動UIは2×で加速しない",
      "再発動も貫通を持ったまま。シールド主体の相手ほど刺さる",
    ],
    weakness:
      "通常攻撃の初回までは再発動できず、CPUと素材費も大きい。原本がポップアップ中はコピーも待機する。部品自体は破壊されない。",
    admin: ["captcha", "cdn", "server", "backup"],
    layout: [
      ["ab_marquee", 224, 24, 440, 28],
      ["gov_pdf", 224, 60, 440, 48],
      ["go_page", 672, 60, 256, 36],
      ["gov_page", 672, 100, 256, 36],
      ["go_cache", 24, 60, 192, 44],
      ["gov_font", 224, 116, 232, 36],
      ["go_suggest", 464, 116, 200, 84],
      ["ab_marquee", 224, 224, 440, 28],
      ["gov_pdf", 224, 260, 440, 48, null, "様式第1号"],
      ["go_page", 672, 260, 256, 36],
      ["gov_page", 672, 300, 256, 36],
      ["go_cache", 24, 260, 192, 44],
      ["gov_font", 224, 316, 232, 36],
      ["go_suggest", 464, 316, 200, 84],
      ["ab_table", 600, 400, 336, 180],
      ["ab_heading", 612, 446, 312, 56, null, "アーカイブ"],
    ],
  },
];

// Additional examples, rather than silently replacing the original authored archetypes.
// These are lab loadouts; their input value is not a promise of campaign availability.
const exampleBase = (id: string) => ({
  ...BUILDS.find((b) => b.id === id)!,
  build: true,
});
BUILDS.push(
  {
    ...BUILDS.find((b) => b.id === "b_fort")!,
    id: "b_fort_native",
    name: "【終盤の構成例】書類の二重防壁",
    pageName: "書類審査 二重窓口",
    address: "archive://build/paperwork-defense",
    concept:
      "各表に実際のPDFを収め、フォームの加速と文字サイズの支援をつなぐ、回復なしのシールド構成。",
    how: [
      "素材の額面合計$74・CPU32。過負荷を避けるには初期CPU12から追加20以上の設備が必要。再抽選・設備代は別で、50通りの購入検証ではこの完成形をそろえた例はなかった",
      "2つのフォームに、PDF入りの表を2つずつ配置。空の表や入れ子だけで人数分の働きを作らず、4つの文書を実際に収納する",
      "通常サイズの文字ツールバーはPDF2つと送信ボタンに届く。文書攻撃は1.5倍になり、フォームの中で加速する",
      "管理設備なし・HP440・CPU35では未統合のセール砲台に有利。購入ボタンの統合や相手の管理設備で勝敗は変わる",
    ],
    weakness:
      "自前の回復はなく、CPUと素材数が重い。貫通の多い資料束、統合済みの購入構成、管理設備の組合せには崩される。ここに示す完成形の勝敗を、購入途中のページには当てはめられない。",
    layout: nativeFortressCandidate(exampleBase("b_fort")).layout,
  },
  {
    ...BUILDS.find((b) => b.id === "b_echo")!,
    id: "b_documents_heavy",
    name: "【終盤の構成例】厚い資料束",
    faction: "gov",
    theme: "gov",
    pageName: "公開資料 ダウンロードセンター",
    address: "archive://build/heavy-documents",
    concept:
      "6つのPDFそれぞれに文字サイズと候補パネルをつなぎ、重い貫通攻撃をまとめる。",
    how: [
      "素材の額面合計$75・CPU27。過負荷を避けるには初期CPU12から追加15以上の設備が必要。再抽選・設備代は別で、PDF6枚と支援6個の重複収集には機会費用がある",
      "各段のPDF2枚が、左の文字ツールバーと右の候補パネルに実際に隣接する。威力は1.5×1.4＝2.1倍。大きく伸ばした支援UIには頼らない",
      "再発動ではなく、6つの文書が自然発動する構成。シールドの多い二重防壁に貫通を通す",
      "50通りの購入検証ではこの完成形は未到達。途中の文書構成には有効例があるが、この6枚を無料で前提にする対策ではない",
    ],
    weakness:
      "同じPDFを6枚集める費用と出現待ちが重く、自然発動の間を狙われる。動画チェックアウトとは条件次第の接戦で、相手の管理設備やCPU条件でも逆転する。自前の回復やシールドはない。",
    layout: heavyDocumentCandidate(exampleBase("b_echo")).layout,
  },
  {
    ...BUILDS.find((b) => b.id === "b_video")!,
    id: "b_video_checkout",
    name: "【終盤の構成例】動画チェックアウト",
    pageName: "二画面動画 応援ストア",
    address: "archive://build/video-checkout",
    concept:
      "2つの埋め込み動画を本物の操作列で加速し、広告と会員収益を1つのカートにつなぐ。",
    how: [
      "素材の額面合計$74・CPU29。過負荷を避けるには初期CPU12から追加17以上の設備が必要。埋め込み動画2つは、それぞれ動画プレイヤー＋シークバーの統合素材を含む。再抽選・設備代は別",
      "両方の動画の直下に2×ボタンを接続。左の字幕・高評価・通知・自動再生も、同じ動画の操作列として働く",
      "右の会員登録と左の動画広告は、右のカートへ届く。収益チャージを共有・消費するので、別のカートへ同じ収益を複製しない",
      "管理設備なし・HP440・CPU35では厚い資料束に0.4HP差の接戦。これは安定した必勝相性を示す数値ではない。統合待ちと途中の配置も考える",
    ],
    weakness:
      "二重防壁や完成した購入構成には押し切られる条件がある。動画2組の統合と操作列の面積が必要で、広告だけを増やしても動画や変換先との接続がなければ伸びない。",
    layout: videoCheckoutCandidate(exampleBase("b_video")).layout,
  },
);


// A small paid-route witness, not another full-budget archetype or a guaranteed shop result.
BUILDS.push({
  id: "b_search_documents",
  name: "【小さな構成例】検索と資料",
  faction: "google",
  theme: "google",
  pageName: "検索から読む資料室",
  address: "archive://build/compact-search-documents",
  concept: "検索を1回統合し、文字サイズ・検索タブ・PDFを実際につなぐ、5個の小さな構成。",
  how: [
    "素材の額面合計$34・CPU11。インスタント検索の検索窓＋候補パネルを含む6素材で、初期CPU12に収まる。購入途中の補助UI・再抽選・設備代は別",
    "検索窓とサジェストを隣接させて対戦し、インスタント検索へ統合。その後、検索の直下に文字サイズとPDF、右隣に検索結果を置く",
    "インスタント検索とPDFは文字サイズと内蔵候補で威力2.175倍。検索結果には内蔵候補の1.45倍、検索と結果にはタブの速度+20%が実際に届く",
    "現行ルールの実購入・報酬・合成を通して完成した検証例がある。ショップの出現や管理設備の入手を保証する構成ではなく、途中の余剰UIもCPUを使う",
  ],
  weakness: "自前の回復とシールドがなく、素早いリンクの手数に押される条件がある。Googleの素材が店に並ぶ時期と統合待ちも必要。額面$34だけで、途中の買い物や完成後の勝利まで保証されるわけではない。",
  admin: [],
  labOpponent: false,
  layout: [
    ["go_tabs", 24, 0, 440, 36],
    ["go_instant", 24, 40, 420, 44],
    ["gov_font", 24, 92, 232, 36],
    ["gov_pdf", 264, 92, 184, 48],
    ["go_result", 452, 40, 480, 96],
  ],
});

// The exact ordinary layout from the frozen <=$40 sample, with a paid-route witness.
BUILDS.push({
  id: "b_navigation_replay",
  name: "【小さな構成例】リンクと流れる文字",
  faction: "retro",
  theme: "retro",
  pageName: "小さなリンクのホームページ",
  address: "archive://build/navigation-replay",
  concept: "3つのリンクと4つのナビを並べ、流れる文字で通常攻撃を再現する、合成なしの8個構成。",
  how: [
    "素材の額面合計$28・CPU9。リンク3個・ナビ4個・流れる文字1個で、初期CPU12に収まる。購入途中の補助UI・再抽選・設備代は別",
    "左の縦3個はメニュー、右の横2個はナビ列となり、その5個が15%加速。旧式UIの15%加速も働くが、7個のリンク系UIにはページ共通の発動間隔1.05倍がかかる",
    "流れる文字は右または下の候補から近い攻撃UIを選ぶ。この配置では左上の「日記」を、通常発動後に55%で再現する。隣接していなくても方向条件で届く",
    "旧8ラウンド遠征の実購入・報酬経路で完成した検証例がある。素材の出現は保証されない。補助UIを残した実盤面はCPU15／容量12で過負荷になる例もあり、この8個だけの相性とは分けて考える",
    "完成後も過負荷なら、補助UIを売らずに手札へ戻して比べる。検証したCPU15／容量12の5例では、ゲストブックだけを手札に戻すとCPU12となり、見出しも戻すより有利だった。回復は失うため、容量が増えた後は再検討する",
  ],
  weakness: "この8個だけには回復もシールドもない。リンク防御に負ける条件があり、「検索と資料」との勝敗もHP300と440で変わる。流れる文字を外せば$21・CPU7になるが、手数が減り、完成済みのワンストップ申請との勝敗も変わる。",
  admin: [],
  labOpponent: false,
  layout: [
    ["ab_link", 40, 104, 192, 32, null, "日記"],
    ["ab_nav", 40, 136, 192, 32, null, "写真館"],
    ["ab_link", 40, 168, 192, 32, null, "リンク集"],
    ["ab_nav", 376, 72, 192, 32, null, "キリ番"],
    ["ab_link", 376, 104, 192, 32, null, "素材"],
    ["ab_nav", 376, 136, 192, 32, null, "更新履歴"],
    ["ab_marquee", 40, 8, 528, 28],
    ["ab_nav", 568, 104, 112, 32],
  ],
});
