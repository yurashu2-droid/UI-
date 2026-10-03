import C from "./document.js";
import { targetCaption } from "./catalog/target-caption.js";
import type { BattleAnalysis, Item } from "./types.js";

const CONVERTERS = new Set(["am_cart", "am_oneclick", "ad_popup", "yt_tip"]);

export interface ConversionGuidanceView {
  state: "unplaced" | "unwired" | "wired";
  sources: { id: string; name: string }[];
}

/** Wiring only: the supplied engine analysis owns route choice, not this view. */
export function conversionGuidance(
  selected: Item,
  info: Pick<BattleAnalysis, "board" | "relations">,
): ConversionGuidanceView | null {
  if (!CONVERTERS.has(selected.type)) return null;
  const placed = info.board.some((part) =>
    part.id === selected.id && part.type === selected.type && C.placed(part));
  if (!placed) return { state: "unplaced", sources: [] };

  const incoming = new Set(info.relations
    .filter((relation) => relation.kind === "conversion" && relation.to === selected.id)
    .map((relation) => relation.from));
  const sources = info.board
    .filter((part) => part.id !== selected.id && C.placed(part) && incoming.has(part.id))
    .map((part) => ({ id: part.id, name: targetCaption(part) }));
  return { state: sources.length ? "wired" : "unwired", sources };
}

function escape(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** A compact selection-card fragment; captions are plain text until escaped here. */
export function renderConversionGuidance(view: ConversionGuidanceView | null) {
  if (!view) return "";
  const content = view.state === "unplaced"
    ? "このページでは未配置です。ページに置くと接続元を確認できます。"
    : view.state === "unwired"
      ? "このUIへチャージを送る収益UIは未接続です。"
      : `<ul class="sel-bonus">${view.sources.map((source) => `<li style="overflow-wrap:anywhere" title="${escape(source.name)}">${escape(source.name)}</li>`).join("")}</ul>`;
  const caveat = view.state === "unplaced"
    ? ""
    : '<p class="muted">接続関係の表示です。収益の発生やチャージの受け入れ・発動には、それぞれの条件があります。</p>';
  return `<div class="sel-connect conversion-guidance"><b>チャージの接続元</b>${content}${caveat}</div>`;
}
