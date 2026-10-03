import type { Run } from "./types.js";

export type SidechannelPlacement = "history" | "pdf";
interface PlacementTarget {
  key: SidechannelPlacement;
  x: number;
  y: number;
  label: string;
}
export interface SidechannelPlacementGuideView {
  breadcrumbId: string;
  current: SidechannelPlacement | null;
  editable: boolean;
  disabledReason: string | null;
  targets: PlacementTarget[];
}

// These are the original four owned IDs created by newRun("lab", "site_slack").
// Deliberately no substitution by type and no inventory reconstruction.
const ORIGINAL = [
  { id: "p1", type: "tw_post", x: 208, y: 112, w: 408, h: 108 },
  { id: "p2", type: "go_history", x: 208, y: 352, w: 288, h: 112 },
  { id: "p3", type: "gov_pdf", x: 648, y: 264, w: 288, h: 48 },
  { id: "p4", type: "gov_breadcrumb", x: 208, y: 316, w: 288, h: 28 },
] as const;
const TARGETS: readonly PlacementTarget[] = [
  { key: "history", x: 208, y: 316, label: "履歴の上へ（15%加速）" },
  { key: "pdf", x: 648, y: 228, label: "PDFの上へ（15%加速）" },
];

/**
 * Pure, narrow recognition of the original SIDECHANNEL teaching board.
 * Labels and appearance do not affect recognition or get replaced. Callers own
 * runtime edit gates, the exact selected ID, current control/run identity and
 * full owned-snapshot freshness, and must revalidate inside Editor.commit.
 */
export function sidechannelPlacementGuide(
  run: Pick<Run, "mode" | "phase" | "page" | "owned">,
  selectedIds: readonly string[],
  options: { editable?: boolean } = {},
): SidechannelPlacementGuideView | null {
  if (run.mode !== "lab" || run.phase !== "build" || run.page.templateId !== "site_slack" ||
    selectedIds.length !== 1 || selectedIds[0] !== "p4" ||
    !run.owned.some(part => part.id === "p4" && part.type === "gov_breadcrumb")) return null;

  let disabledReason: string | null = null;
  if (run.owned.length !== ORIGINAL.length) {
    disabledReason = "4部品を増減したため、この比較は使えません。";
  } else if (new Set(run.owned.map(part => part.id)).size !== ORIGINAL.length ||
    ORIGINAL.some(expected => !run.owned.some(part => part.id === expected.id && part.type === expected.type))) {
    disabledReason = "部品の識別が元のお手本と異なるため、この比較は使えません。";
  } else if (ORIGINAL.some(expected => {
    const part = run.owned.find(part => part.id === expected.id)!;
    return part.w !== expected.w || part.h !== expected.h;
  })) {
    disabledReason = "部品のサイズが変わったため、この比較は使えません。";
  } else if (run.owned.some(part => typeof part.x !== "number" || typeof part.y !== "number" ||
    !Number.isFinite(part.x) || !Number.isFinite(part.y))) {
    disabledReason = "未配置の部品があるため、この比較は使えません。";
  } else if (ORIGINAL.slice(0, 3).some(expected => {
    const part = run.owned.find(part => part.id === expected.id)!;
    return part.x !== expected.x || part.y !== expected.y;
  })) {
    disabledReason = "ほかの部品を動かしたため、この比較は使えません。";
  }

  const breadcrumb = run.owned.find(part => part.id === "p4")!;
  const position = TARGETS.find(target => target.x === breadcrumb.x && target.y === breadcrumb.y);
  if (!disabledReason && !position) disabledReason = "パンくずが比較位置の外にあるため、この比較は使えません。";
  const current = disabledReason ? null : position!.key;
  if (!disabledReason && options.editable !== true)
    disabledReason = "実験室の自分のページを編集できるときに使えます。";
  return {
    breadcrumbId: "p4",
    current,
    editable: disabledReason === null,
    disabledReason,
    targets: TARGETS.map(target => ({ ...target })),
  };
}

function escape(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

/** Fragment only. The host binds these exact button nodes after its own repaint. */
export function renderSidechannelPlacementGuide(view: SidechannelPlacementGuideView | null): string {
  if (!view) return "";
  const status = view.current === "history" ? "履歴を15%加速"
    : view.current === "pdf" ? "PDFを15%加速" : "比較できない配置";
  const controls = view.targets.map(target =>
    `<button type="button" data-sidechannel-placement="${escape(target.key)}" data-source-id="${escape(view.breadcrumbId)}" aria-pressed="${target.key === view.current}"${view.editable ? "" : " disabled"}>${escape(target.label)}</button>`).join("");
  return `<div class="sel-connect sidechannel-placement-guide"><b>SIDECHANNELの配置比較</b>
<p class="muted">現在：${status}</p><div class="sel-actions">${controls}</div>
${view.disabledReason ? `<p class="muted">${escape(view.disabledReason)}</p>` : ""}
<p class="muted">パンくず1個だけを移動します。元に戻すで取り消せます。復元量は相手の被害と発動時刻で変わります</p></div>`;
}
