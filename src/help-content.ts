import D from "./data.js";
import R from "./run.js";
import { factionSetView } from "./app-guidance.js";
import { STORY_STAGES, STORY_TITLE } from "./story/content.js";
import type { Mode } from "./types.js";

export interface HelpContent {
  kicker: string;
  title: string;
  steps: { title: string; text: string }[];
  controls: string[];
}

/** Story has a campaign-shaped run, so its active flag must take precedence. */
export function getHelpContent(context: {
  storyActive: boolean;
  mode: Mode;
}): HelpContent {
  const lab = !context.storyActive && context.mode === "lab";
  const controls = [
    "配置したUIにTabでフォーカス → Enter/Space：選択",
    "Shift+Enter/Space：選択を追加・解除",
    "Shift＋クリック：複数選択",
    "G：まとまりを選択",
    "Alt＋ドラッグ：くっつき無効",
    `Delete/Backspace：手持ちへ（${lab ? "削除は右の「削除」" : "売却は右の「売る」"}）`,
    "Ctrl/Cmd+Z：元に戻す",
    "Ctrl/Cmd+Shift+Z または Ctrl/Cmd+Y：やり直す",
  ];
  const supportedSets = Object.entries(D.FACTIONS)
    .filter(([id]) => factionSetView(id, 0).threshold !== null)
    .map(([, definition]) => definition.name)
    .join("・");
  const sharedSteps = [
    {
      title: "連結と強化先を確認する",
      text: "検索窓＋ボタン、動画＋シークバーなど、対応するUIをくっつけます。右の「シナジー」と選択中のUIの説明で、実際の連結・内包・強化先を確認できます。",
    },
    {
      title: "セット効果を確認する",
      text: `${supportedSets}は、同じ系統を3つページに置くとセット効果。「シナジー」で内容を確認。その他の試作・テンプレート系統には追加の3個セット補正はありません。`,
    },
  ];
  const capacityStep = {
    title: "重さと処理能力を見直す",
    text: "ページの重さが処理能力を超えると、UIの発動が遅くなります。不要なUIを手持ちに戻すか、巡回先の「レンタルサーバー」を購入して処理能力を増やせます。",
  };
  if (context.storyActive) {
    const victories = STORY_STAGES.reduce((sum, stage) => sum + stage.encounters.length, 0);
    return {
      kicker: STORY_TITLE,
      title: "物語の遊び方",
      steps: [
        {
          title: `${STORY_STAGES.length}段階・${victories}勝で進む物語`,
          text: "「ジャンクの作業場」から自分のページを編集。巡回先でUIを購入・配置し、攻撃UIを1つ以上置いたら「機械へ接続」。物語は旧遠征・オンラインとは別保存です。",
        },
        {
          title: "負けたらページを組み直す",
          text: "敗北・引き分けでライフが1つ減ります。ライフが残っていれば同じ相手に再挑戦できるので、配置・連結・重さを見直そう。ライフが尽きても、最後のページと回収記録は保存されています。",
        },
        {
          title: "回収品と重要記録を受け取る",
          text: "勝利後は「回収品を選ぶ」でUIを1つ選ぶか、回収を見送ってから次へ。手持ちが満杯なら作業場の「物語の受取箱」に保管されます。重要記録は章攻略で確実に保存され、UIの選択とは別です。作業場で記録を確認してから次の段階へ。",
        },
        ...sharedSteps,
        capacityStep,
      ],
      controls,
    };
  }
  if (lab) {
    return {
      kicker: "LABORATORY",
      title: "実験室の遊び方",
      steps: [
        {
          title: "すべてのUIを無料で試す",
          text: "左の「UIライブラリ」からUIを無料で配置できます。メニューの「ページのお手本」から構成を読み込むこともできます。試作部品は実験室用で、通常のショップ・報酬には出ません。",
        },
        {
          title: "相手を選んでテスト対戦",
          text: "右の対戦相手を選び、攻撃UIを1つ以上配置して「テスト対戦」。対戦後は配置を変えて何度でも比較できます。実験室の構成は本編とは別に保存されます。",
        },
        {
          title: "追加の実験ルールは選択式",
          text: "「対戦ルール［実験室限定］」で広告・登録や一時サーバー負荷を明示的に選んだ時だけ追加ルールが有効です。実験室を離れると通常ルールに戻ります。",
        },
        ...sharedSteps,
      ],
      controls,
    };
  }
  return {
    kicker: "LEGACY RUN",
    title: "旧遠征の遊び方",
    steps: [
      {
        title: "資金でUIを移植する",
        text: "左の「巡回先のサイト」からUIをドラッグして自分のページへ。移植には資金がかかります。対戦後に基本収入・勝利ボーナス・対戦中の収益を精算します。",
      },
      {
        title: `${R.ROUNDS}ラウンドの遠征に挑む`,
        text: "攻撃UIを1つ以上置いたら「公開して対戦」。敗北・引き分けでライフが1つ減り、ライフが残っていれば次のラウンドへ進みます。ライフが尽きるか、最終ラウンドを終えると遠征終了です。",
      },
      {
        title: "勝利報酬を選んで進む",
        text: "勝利後は「報酬を受け取る」で1つ選ぶか、何も取らずに進めます。手持ちが満杯のUI報酬はメニューの「報酬の受取箱」に残ります。",
      },
      ...sharedSteps,
      capacityStep,
    ],
    controls,
  };
}

const entities: Record<string, string> = {
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
};
const escape = (value: string) => value.replace(/[&<>"']/g, character => entities[character]);

/** The host retains its modal heading, close controls and dialog lifecycle. */
export function renderHelpBody(content: HelpContent): string {
  return `<div class="howto">${content.steps.map((step, index) =>
    `<div><b>${index + 1}</b><p><strong>${escape(step.title)}</strong>${escape(step.text)}</p></div>`,
  ).join("")}</div><p class="muted">編集操作：${content.controls.map(escape).join(" / ")}</p>`;
}
