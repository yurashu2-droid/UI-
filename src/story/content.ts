import D from "../data.js";
import type { EnemyDefinition, LayoutEntry } from "../types.js";
import type { StoryEncounter, StoryStage } from "./types.js";

/** Authored fictional coordinates; rendered locally and never fetched from an archive service. */
export const ARCHIVE_COORDINATES = Object.freeze({
  url: "https://homepage.example/",
  date: "2001-06-17",
  restoredUrl: "story://restored-homepage",
});
export const STORY_TITLE = "THE LAST BROWSER";
export const STORY_WORLD = {
  place: "インターネット最終廃棄場",
  blank: ["このページは表示できます。", "表示する内容がありません。"],
  premise:
    "Web戦争とホワイトアウトの後。崩れたインターネットの廃棄物から、まだ起動するブラウザ端末を拾った。",
  machine:
    "接続・解析は、この機械の一般的な機能。自分のページは手元のブラウザに残る。",
  fusion: [
    "待て。それ、並べただけじゃないのか？",
    "……そんな機能、どっちにも入ってなかったぞ",
  ],
  promise: "また更新するので、ここを残しておいてね",
};
function enemy(
  id: string,
  source: number,
  name: string,
  hp: number,
  layout?: LayoutEntry[],
  admin?: string[],
  preserveDecor = false,
): EnemyDefinition {
  const base = structuredClone(D.ENEMIES[source]);
  return {
    ...base,
    id,
    name,
    pageName: name,
    address: `archive://${id}/`,
    hp,
    fee: 0,
    reward: 0,
    layout: layout ?? base.layout,
    admin: admin ?? base.admin,
    decor: layout && !preserveDecor ? [] : base.decor,
  };
}
function encounter(
  id: string,
  title: string,
  boss: boolean,
  foe: EnemyDefinition,
  briefing: string,
): StoryEncounter {
  return { id, title, boss, enemy: { ...foe, tip: briefing }, briefing };
}
const retro: LayoutEntry[] = [
  ["ab_heading", 32, 28, 576, 56, null, "ようこそ、わたしのホームページへ"],
  ["ab_link", 32, 116, 192, 32, null, "好きなもの"],
];
const fast: LayoutEntry[] = [
  ["ab_link", 32, 40, 192, 32, null, "自己紹介"],
  ["ab_nav", 224, 40, 176, 32, null, "リンク集"],
  ["ab_link", 400, 40, 192, 32, null, "更新履歴"],
  ["ab_hr", 32, 100, 560, 16],
  ["ab_counter", 32, 150, 288, 26],
];
const community: LayoutEntry[] = [
  ["ab_heading", 32, 24, 576, 56, null, "保存された掲示板"],
  ["ab_guestbook", 32, 104, 320, 132],
  ["ab_counter", 32, 260, 288, 26],
  ["ab_link", 384, 104, 192, 32, null, "最後の返信"],
  ["yt_notify", 384, 156, 72, 40],
  ["ab_nav", 456, 156, 176, 40],
];
const hidden: LayoutEntry[] = [
  ["gov_form", 32, 36, 400, 280],
  ["gov_check", 52, 110, 280, 32],
  ["gov_submit", 52, 164, 240, 40],
  ["go_search", 480, 36, 420, 44],
  ["go_suggest", 480, 80, 420, 84],
  ["go_result", 480, 200, 420, 96],
  ["ab_link", 32, 372, 192, 32, null, "規格の境界"],
];
const whiteout: LayoutEntry[] = [
  ["go_search", 32, 32, 420, 44],
  ["go_lucky", 452, 32, 184, 44],
  ["go_result", 32, 116, 560, 96],
  ["gov_pdf", 32, 240, 360, 48],
  ["gov_notice", 32, 324, 560, 56],
  ["yt_play", 640, 116, 280, 170],
  ["yt_progress", 640, 286, 280, 22],
  ["yt_notify", 640, 308, 72, 40],
  ["ab_hr", 32, 432, 560, 16],
];
export const STORY_STAGES: readonly StoryStage[] = [
  {
    id: "salvage",
    number: 1,
    title: "白紙のホームページ",
    objective: "古代個人HPからUIを回収し、軽量な高速サイトを突破する",
    intro: [
      STORY_WORLD.premise,
      "画面には白紙のホームページ。まずは、このページに名前をつけよう。",
    ],
    encounters: [
      encounter(
        "salvage-personal",
        "古代個人HP",
        false,
        enemy("salvage-personal", 0, "わたしのホームページ", 100, retro, []),
        "見出しと青いリンクだけのページ。軽さと、リンク同士の連結を試そう。",
      ),
      encounter(
        "salvage-fast",
        "高速個人サイト",
        true,
        enemy("salvage-fast", 0, "軽量高速ホームページ", 155, fast, ["server"]),
        "小さなUIを強いサーバーで回すサイト。大きな部品を増やす前に、配置と連結を見直そう。",
      ),
    ],
    record: {
      id: "broken-counter",
      title: "壊れた訪問カウンター",
      text: [
        "回収品の底に、数字の止まった訪問カウンターがあった。",
        "ジャンクは値札を付けず、CRTのそばへ置いた。",
      ],
      junk: [
        "……これ、売らずに置いといていいか。",
        "数字が止まってるだけだ。直せるかもしれない。",
      ],
    },
  },
  {
    id: "delivery",
    number: 2,
    title: "届かない荷物",
    objective: "旧ECサイトで収益と投資を学び、個人サーバーの契約記録を回収する",
    intro: [
      "発送済みの表示だけが残る、旧ECサイトへ。",
      "買う、稼ぐ、サーバーに投資する。異なる部品の合成も試してみよう。",
    ],
    encounters: [
      encounter(
        "delivery-store",
        "閉じた売り場",
        false,
        enemy(
          "delivery-store",
          3,
          "荷物の届かない売り場",
          210,
          [
            ["am_buy", 32, 48, 168, 40],
            ["am_coupon", 32, 104, 280, 36],
            ["am_quantity", 200, 48, 112, 40],
            ["am_wish", 32, 160, 192, 40],
          ],
          [],
        ),
        "購入UIと収益のつながりを見つけよう。",
      ),
      encounter(
        "delivery-contract",
        "自動契約窓口",
        true,
        enemy(
          "delivery-contract",
          3,
          "更新し続ける契約",
          270,
          D.ENEMIES[3].layout
            .filter((row) =>
              [
                "am_product",
                "am_quantity",
                "am_buy",
                "am_wish",
                "am_coupon",
                "am_cart",
              ].includes(row[0]),
            )
            .filter(
              (row, index, all) =>
                all.findIndex((other) => other[0] === row[0]) === index,
            ),
          ["server"],
          true,
        ),
        "収益が購入機能を動かす。自分の運営設備にも投資する余地を残そう。",
      ),
    ],
    record: {
      id: "server-contract",
      title: "個人サーバーの維持契約",
      text: [
        "大きな売り場の契約記録に、小さな個人サーバーが載っている。",
        "長いあいだ、同じページの維持費が払い続けられていた。",
      ],
      junk: ["古い契約だな。……まだ残ってたのか。"],
    },
  },
  {
    id: "playback",
    number: 3,
    title: "終わらない再生",
    objective: "重い動画UIと再発動を組み合わせ、壊れた映像記録を回収する",
    intro: [
      "誰も操作しない再生リストが、同じ動画を回し続けている。",
      "重いUIを、補助と再発動でどう働かせるか。",
    ],
    encounters: [
      encounter(
        "playback-loop",
        "再生待ちの画面",
        false,
        enemy(
          "playback-loop",
          4,
          "終わらない再生リスト",
          290,
          [
            ["yt_play", 32, 32, 560, 280],
            ["yt_progress", 32, 312, 560, 22],
            ["yt_autoplay", 32, 334, 176, 40],
            ["yt_notify", 208, 334, 72, 40],
          ],
          [],
        ),
        "動画の直下に何がつながっているか、よく見よう。",
      ),
      encounter(
        "playback-master",
        "自動再生の管理サイト",
        true,
        enemy("playback-master", 4, "自動再生アーカイブ", 340),
        "重さと連動を両立するサイト。処理能力の余裕も確認しよう。",
      ),
    ],
    record: {
      id: "homepage-video",
      title: "「ホームページができました」",
      text: [
        "短い映像の見出しだけが読める。『ホームページができました』",
        "映像は欠けていて、そのままでは再生できない。",
      ],
      junk: ["どこにあった？　ほかに、音は残ってなかったか。"],
    },
  },
  {
    id: "search",
    number: 4,
    title: "検索結果はありません",
    objective: "検索塔を攻略し、探しているURLの過去の記録を見つける",
    intro: [
      "ジャンクが、探していたURLを初めて見せる。",
      "現在の検索結果には、一件も出てこない。",
    ],
    encounters: [
      encounter(
        "search-index",
        "検索塔の索引",
        false,
        enemy("search-index", 2, "存在しない検索結果", 350),
        "検索フォームと文字の連動が入口を守っている。",
      ),
      encounter(
        "search-tower",
        "検索塔の管理サイト",
        true,
        enemy("search-tower", 2, "検索塔・保存索引", 390),
        "現在の索引の奥へ。記録は攻略時に必ず回収できる。",
      ),
    ],
    record: {
      id: "past-index",
      title: "過去に存在したURL",
      text: [
        "そのURLは、過去の索引には存在していた。",
        "保存先の名前が見つかる。『Web Time Machine』",
      ],
      junk: ["今の場所だけじゃ、見つからないのか。"],
    },
  },
  {
    id: "reply",
    number: 5,
    title: "最後の返信",
    objective: "閉じたコミュニティで、ジャンクの以前の仕事を知る",
    intro: [
      "通知だけが残る、死んだSNSと閉じた掲示板。",
      "反応と連動の間に、送られたままの返信が残っている。",
    ],
    encounters: [
      encounter(
        "reply-board",
        "閉じたコミュニティ",
        false,
        enemy("reply-board", 0, "最後の返信・保存掲示板", 390, community, [
          "moderator",
        ]),
        "掲示板、通知、リンクが互いを支えている。",
      ),
      encounter(
        "reply-archive",
        "通知の保存庫",
        true,
        enemy("reply-archive", 0, "返事を待つ保存庫", 430, community, [
          "moderator",
          "backup",
        ]),
        "回復と通知のつながりを見極めよう。",
      ),
    ],
    record: {
      id: "last-reply",
      title: "管理AIへの最後の返信",
      text: [
        "ジャンクは、個人ホームページの更新を手伝うAIだった。",
        "リンク切れを直し、掲示板の迷惑投稿を消していた。",
        `持ち主の言葉が残っている。『${STORY_WORLD.promise}』`,
      ],
      junk: ["……そうだ。それが、俺の仕事だった。"],
    },
  },
  {
    id: "permission",
    number: 6,
    title: "記録へのアクセス権",
    objective: "旧行政網で保存記録の閲覧証明を手に入れる",
    intro: [
      "保存記録を読むための証明を、旧行政ネットワークへ申請する。",
      "申請を読むための申請書も、まだ配布されている。",
    ],
    encounters: [
      encounter(
        "permission-desk",
        "保存記録の申請窓口",
        false,
        enemy("permission-desk", 1, "記録閲覧の申請窓口", 440),
        "防御と長期戦。書類の連結と包含に備えよう。",
      ),
      encounter(
        "permission-proof",
        "閲覧証明の審査",
        true,
        enemy("permission-proof", 1, "旧行政網・最終審査", 480),
        "手続きの奥には、ページを守るための支払い記録がある。",
      ),
    ],
    record: {
      id: "memory-payments",
      title: "記憶と機能の売却記録",
      text: [
        "サーバーの維持費は、ジャンク自身の機能と記憶を売って支払われていた。",
        "誰を待つのか、どんな声だったのかは欠けても、『このページを残す』仕事だけは止まらなかった。",
        "店主だからページを探していたのではない。ページを残すために、店主になった。",
      ],
      junk: [
        "もう、何を売ったのかも全部は覚えてない。",
        "奥のサーバーは、切れなかった。",
      ],
    },
  },
  {
    id: "hidden",
    number: 7,
    title: "検索されない場所",
    objective: "奥の通信設備で架空の隠されたネットワークへ接続する",
    intro: [
      "ジャンクが、店の奥で眠っていた通信設備を動かす。",
      "通常の検索網から切り離された場所へ。ここで描くダークウェブは、ゲーム内だけの架空のネットワーク。",
    ],
    encounters: [
      encounter(
        "hidden-boundary",
        "規格の境界",
        false,
        enemy("hidden-boundary", 2, "切り離された接続境界", 490, hidden, [
          "captcha",
        ]),
        "合成してきた記録が、端末に新しい接続能力を残している。特定の部品を盤面に残す必要はない。",
      ),
      encounter(
        "hidden-relay",
        "最後の接続経路",
        true,
        enemy("hidden-relay", 2, "記録へ続く中継機", 530, hidden, [
          "captcha",
          "backup",
        ]),
        "異なる規格をつないだ端末で、保存庫への最後の経路を開く。",
      ),
    ],
    record: {
      id: "archive-route",
      title: "Web Time Machineへの経路",
      text: [
        "既存の規格を越える接続経路が、端末に蓄積された合成記録から組み上がる。",
        "接続先と保存日時を復元する手掛かりが揃った。",
      ],
      junk: ["違う時代の部品が、こんなところまでつながるのか。"],
    },
  },
  {
    id: "last-browser",
    number: 8,
    title: "THE LAST BROWSER",
    objective: "ホワイトアウトの残存プログラムを突破し、保存されたページを開く",
    intro: [
      "Web Time Machineへの接続を、ホワイトアウトの残存プログラムが切り続けている。",
      "ここまで育てた、自分のページで突破する。",
    ],
    encounters: [
      encounter(
        "last-browser-whiteout",
        "ホワイトアウトの残存プログラム",
        true,
        enemy(
          "last-browser-whiteout",
          2,
          "WHITEOUT / 残存プログラム",
          560,
          whiteout,
          ["server", "backup"],
        ),
        "必要な物語上の機能は端末に記録済み。最後の盤面に特定のUIを強制しない。",
      ),
    ],
    record: {
      id: "archive-coordinates",
      title: "そのページが、まだそこにあった時間",
      text: [
        "最後の妨害が消え、機械に二つの入力欄が現れた。URLと日付。",
        "探していたのは、場所だけではなかった。そのページが、まだそこにあった時間。",
      ],
      junk: ["……開いてみてくれ。"],
    },
  },
];
export const ENDING = {
  title: "また誰かが来た",
  recognition: [
    "……ああ。この色だった",
    "見づらいから変えろって、何度も言ったんだ",
    "それでも、これが好きだって",
  ],
  diary: "また更新します。来てくれてありがとう。",
  farewell: [
    "ひどいページだな。時代も色も、何も合ってない",
    "……よく、ここまでつないだもんだ",
  ],
  archiveNotice:
    "これは過去の保存記録です。過去は変更されず、持ち主から新しい返事も届きません。",
  restoration:
    "保存記録を残したまま、現在のネットワークに訪問できる場所を復元します。",
};
