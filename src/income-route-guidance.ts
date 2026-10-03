import C from "./document.js";
import E from "./engine.js";
import { targetCaption } from "./catalog/target-caption.js";
import type { BattleAnalysis, Item } from "./types.js";

interface RouteTarget {
  id: string;
  name: string;
}
export interface IncomeRouteGuidanceView {
  sourceId: string;
  placed: boolean;
  editable: boolean;
  candidates: RouteTarget[];
  saved: (RouteTarget & { available: boolean }) | null;
  effective: RouteTarget | null;
}
export interface IncomeRouteGuidanceOptions {
  /** Full inventory, including stashed targets whose saved preference stays intact. */
  owned: Item[];
  /** Only the explicit laboratory server-pressure experiment enables jobs. */
  pressure?: boolean;
  /** Current app editability; callers must check it again when committing an edit. */
  editable?: boolean;
}

/** Pure projection: legal candidates belong to the engine, actual wiring to its analysis. */
export function incomeRouteGuidance(
  selected: Item,
  info: Pick<BattleAnalysis, "board" | "near" | "relations">,
  options: IncomeRouteGuidanceOptions,
): IncomeRouteGuidanceView | null {
  const ownedSource = options.owned.find((part) =>
    part.id === selected.id && part.type === selected.type);
  if (!ownedSource || !E.isIncomeProducer(ownedSource)) return null;
  const source = info.board.find((part) =>
    part.id === ownedSource.id && part.type === ownedSource.type && C.placed(part));
  const candidates = source
    ? E.incomeRouteCandidates(info.board.filter(C.placed), info.near, source, options.pressure ?? false)
        .map((part) => ({ id: part.id, name: targetCaption(part) }))
    : [];
  const savedId = ownedSource.routeTo;
  const savedTarget = options.owned.find((part) => part.id === savedId);
  const saved = typeof savedId === "string" && savedId.length
    ? {
        id: savedId,
        name: savedTarget ? targetCaption(savedTarget) : "不明なUI",
        available: candidates.some((part) => part.id === savedId),
      }
    : null;
  const route = source && info.relations.find((relation) =>
    relation.kind === "conversion" && relation.from === source.id &&
    candidates.some((part) => part.id === relation.to));
  const effective = route ? candidates.find((part) => part.id === route.to) ?? null : null;
  return {
    sourceId: ownedSource.id,
    placed: !!source,
    editable: !!source && C.placed(ownedSource) && options.editable === true,
    candidates,
    saved,
    effective: effective ? { ...effective } : null,
  };
}

function escape(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Escaped selection-card fragment; rendering never rewrites a stored preference. */
export function renderIncomeRouteGuidance(view: IncomeRouteGuidanceView | null) {
  if (!view) return "";
  const saved = view.saved;
  const unavailable = saved && !saved.available
    ? `<option value="${escape(saved.id)}" selected disabled>${escape(saved.name)}（現在は利用不可）</option>`
    : "";
  const candidates = view.candidates.map((part) =>
    `<option value="${escape(part.id)}"${saved?.id === part.id ? " selected" : ""}>${escape(part.name)}</option>`).join("");
  const stored = saved
    ? `${escape(saved.name)}${saved.available ? "" : "（現在は利用不可・指定は保持）"}`
    : "自動（近い受け皿を優先）";
  const effective = view.effective ? escape(view.effective.name) : "未接続";
  const status = !view.placed
    ? "この収益UIは未配置です。ページに配置してから接続先を変更できます。"
    : saved && !saved.available
      ? "指定先が現在の接続候補にないため、自動へフォールバックします。候補に戻ると保存した指定が優先されます。"
      : "近い受け皿だけを選べます。自動では距離やページ上の位置などの規則で1つを選びます。";
  return `<div class="sel-connect income-route-guidance"><label for="sel-income-route"><b>収益の接続先</b></label>
<select id="sel-income-route" class="select-input" style="max-width:100%;min-width:0" data-source-id="${escape(view.sourceId)}"${view.editable ? "" : " disabled"}><option value=""${saved ? "" : " selected"}>自動（近い受け皿）</option>${unavailable}${candidates}</select>
<p class="muted" style="overflow-wrap:anywhere">保存した指定：${stored}</p>
<p class="muted" style="overflow-wrap:anywhere">実際の接続先：${effective}</p>
<p class="muted">${status}</p>
<p class="muted">接続だけでは収益を増やしません。収益の発生条件や受け皿の発動条件は変わりません。同じ収益は二重配分せず、受け皿が満杯でも余りは別の受け皿へ流れません。</p></div>`;
}
