import type { Run } from "./types.js";
import C from "./document.js";

export type RedditSidebarPlacement = "thread" | "reading" | "detached" | "sidebar" | "inside";
interface PlacementTarget {
  key: RedditSidebarPlacement;
  x: number;
  y: number;
  label: string;
  editable: boolean;
  disabledReason: string | null;
}
export interface RedditSidebarPlacementGuideView {
  sourceId: string;
  sourceKind: "link" | "font";
  current: RedditSidebarPlacement | null;
  editable: boolean;
  disabledReason: string | null;
  targets: PlacementTarget[];
}
export interface RedditSidebarPlacementIntent {
  sourceId: string;
  key: RedditSidebarPlacement;
  x: number;
  y: number;
}
type GuideRun = Pick<Run, "mode" | "phase" | "page" | "owned">;
type GuideOptions = { editable?: boolean };

// Exact IDs from newRun("lab", "lesson_reddit_sidebar"). Do not adopt another
// part of the same type, recreate inventory, or restore the other six pieces.
const ORIGINAL = [
  { id: "p1", type: "rd_vote", x: 24, y: 132, w: 48, h: 128 },
  { id: "p2", type: "rd_post", x: 84, y: 132, w: 552, h: 128 },
  { id: "p3", type: "rd_thread", x: 24, y: 286, w: 612, h: 360 },
  { id: "p4", type: "rd_vote", x: 40, y: 340, w: 48, h: 128 },
  { id: "p5", type: "rd_post", x: 100, y: 340, w: 520, h: 128 },
  { id: "p6", type: "ab_link", x: 100, y: 492, w: 208, h: 32 },
  { id: "p7", type: "wk_reference", x: 100, y: 548, w: 500, h: 52 },
  { id: "p8", type: "gov_font", x: 692, y: 444, w: 232, h: 36 },
] as const;

const LINK_TARGETS = [
  { key: "thread", x: 100, y: 492, label: "返信内の初期位置へ" },
  { key: "reading", x: 692, y: 492, label: "右の読書棚へ" },
  { key: "detached", x: 692, y: 552, label: "棚から離した位置へ" },
] as const;
const FONT_TARGETS = [
  { key: "sidebar", x: 692, y: 444, label: "右の初期位置へ" },
  { key: "inside", x: 316, y: 492, label: "返信内へ" },
] as const;

/**
 * Pure recognition of this one teaching board. Labels, appearance/provenance
 * and route metadata are neither used to select a substitute nor rewritten.
 * The host owns story/online/preview/battle, self-view, drag/dialog and current
 * control/run/selection/full-owned-snapshot gates, repeated inside commit.
 */
export function redditSidebarPlacementGuide(
  run: GuideRun,
  selectedIds: readonly string[],
  options: GuideOptions = {},
): RedditSidebarPlacementGuideView | null {
  if (run.mode !== "lab" || run.phase !== "build" || run.page.templateId !== "lesson_reddit_sidebar" ||
    selectedIds.length !== 1 || !["p6", "p8"].includes(selectedIds[0])) return null;
  const sourceId = selectedIds[0], sourceKind = sourceId === "p6" ? "link" : "font";
  const source = run.owned.find(part => part.id === sourceId && part.type === (sourceKind === "link" ? "ab_link" : "gov_font"));
  if (!source) return null;
  const targets = sourceKind === "link" ? LINK_TARGETS : FONT_TARGETS;
  let disabledReason: string | null = null;
  if (run.owned.length !== ORIGINAL.length) {
    disabledReason = "8部品を増減したため、この比較は使えません。";
  } else if (new Set(run.owned.map(part => part.id)).size !== ORIGINAL.length ||
    ORIGINAL.some(expected => !run.owned.some(part => part.id === expected.id && part.type === expected.type))) {
    disabledReason = "部品の識別が元のお手本と異なるため、この比較は使えません。";
  } else if (ORIGINAL.some(expected => {
    const part = run.owned.find(part => part.id === expected.id)!;
    return part.w !== expected.w || part.h !== expected.h;
  })) {
    disabledReason = "部品のサイズが変わったため、この比較は使えません。";
  } else if (run.owned.some(part => part.shape !== "source")) {
    disabledReason = "部品の形が変わったため、この比較は使えません。";
  } else if (run.owned.some(part => !C.placed(part))) {
    disabledReason = "未配置または無効な位置の部品があるため、この比較は使えません。";
  } else if (ORIGINAL.filter(expected => expected.id !== "p6" && expected.id !== "p8").some(expected => {
    const part = run.owned.find(part => part.id === expected.id)!;
    return part.x !== expected.x || part.y !== expected.y;
  })) {
    disabledReason = "ほかの部品を動かしたため、この比較は使えません。";
  } else {
    const link = run.owned.find(part => part.id === "p6")!, font = run.owned.find(part => part.id === "p8")!;
    if (!LINK_TARGETS.some(target => target.x === link.x && target.y === link.y) ||
      !FONT_TARGETS.some(target => target.x === font.x && target.y === font.y))
      disabledReason = "青リンクか文字サイズが比較位置の外にあるため、この比較は使えません。";
    else if (run.owned.some(part => !C.canPlace(run.owned, part, part.x, part.y)))
      disabledReason = "部品が重なるかページに収まらないため、この比較は使えません。";
  }
  const current = disabledReason ? null : targets.find(target => target.x === source.x && target.y === source.y)!.key;
  if (!disabledReason && options.editable !== true)
    disabledReason = "実験室の自分のページを編集できるときに使えます。";
  const link = run.owned.find(part => part.id === "p6"), font = run.owned.find(part => part.id === "p8");
  return {
    sourceId, sourceKind, current,
    editable: disabledReason === null, disabledReason,
    targets: targets.map(target => {
      let reason = disabledReason;
      if (!reason && target.key === "inside" && (link?.x !== 100 || link.y !== 492))
        reason = "青リンクを選び、返信内の初期位置へ先に戻してください。この操作でリンクは動かしません。";
      if (!reason && ["reading", "detached"].includes(target.key) && (font?.x !== 692 || font.y !== 444))
        reason = "文字サイズを選び、右の初期位置へ先に戻してください。この操作で文字サイズは動かしません。";
      if (!reason && !C.canPlace(run.owned, source, target.x, target.y))
        reason = "移動先で部品が重なるかページに収まらないため、この位置は使えません。";
      return { ...target, editable: reason === null, disabledReason: reason };
    }),
  };
}

/** Pure x/y intent only; the host owns its Editor.commit and freshness gates. */
export function redditSidebarPlacementIntent(
  run: GuideRun,
  selectedIds: readonly string[],
  key: string,
  options: GuideOptions = {},
): RedditSidebarPlacementIntent | null {
  const view = redditSidebarPlacementGuide(run, selectedIds, options);
  const target = view?.editable && view.current !== key
    ? view.targets.find(target => target.key === key && target.editable) : undefined;
  return view && target ? { sourceId: view.sourceId, key: target.key, x: target.x, y: target.y } : null;
}

function escape(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

/** Fragment only. The host binds these exact button nodes after its own repaint. */
export function renderRedditSidebarPlacementGuide(view: RedditSidebarPlacementGuideView | null): string {
  if (!view) return "";
  const status = view.targets.find(target => target.key === view.current)?.label.replace(/へ$/, "") ?? "比較できない配置";
  const controls = view.targets.map(target =>
    `<div class="sel-actions"><button type="button" data-reddit-sidebar-placement="${escape(target.key)}" data-source-id="${escape(view.sourceId)}" aria-pressed="${target.key === view.current}"${view.editable && target.editable ? "" : " disabled"}>${escape(target.label)}</button></div>`).join("");
  const reasons = [...new Set([view.disabledReason, ...view.targets.map(target => target.disabledReason)])]
    .filter((reason): reason is string => reason !== null)
    .map(reason => `<p class="muted">${escape(reason)}</p>`).join("");
  return `<div class="sel-connect reddit-sidebar-placement-guide"><b>返信とサイドバーの配置比較</b>
<p class="muted">${view.sourceKind === "link" ? "青リンク" : "文字サイズ"}の現在位置：${escape(status)}</p>${controls}${reasons}
<p class="muted">選択した1部品だけを移動します。元に戻すで取り消せます。</p>
<p class="muted">別案：青リンクを初期位置へ戻し、文字サイズを選んで返信内へ移せます。</p>
<p class="muted">測定値は固定の相手・HP・CPU・時間などの条件に限り、勝利や有利さを保証しません。</p></div>`;
}
