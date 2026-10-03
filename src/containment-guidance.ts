import C from "./document.js";
import D from "./data.js";
import { targetCaption } from "./catalog/target-caption.js";
import type { BattleAnalysis, Item } from "./types.js";

interface ContainmentTarget {
  id: string;
  name: string;
}
export interface ContainmentGuidanceView {
  /** Only selected containers or nested items; ordinary loose items stay quiet. */
  items: (ContainmentTarget & {
    parent: ContainmentTarget | null;
    isContainer: boolean;
    directChildCount: number;
    descendantCount: number;
  })[];
  selectedCount: number;
  /** Union across selected ancestors, excluding every explicitly selected ID. */
  unselectedDescendantCount: number;
  editable: boolean;
}

/**
 * Pure selection projection. Pass the displayed battle's board/parents, never a
 * separately reconstructed tree. Captions also belong to that supplied snapshot.
 * Set editable only for the current editable document; omission is read-only.
 * Missing/type-mismatched or currently unplaced selections suppress action copy.
 */
export function containmentGuidance(
  selected: readonly Item[],
  info: Pick<BattleAnalysis, "board" | "parents">,
  options: { editable?: boolean } = {},
): ContainmentGuidanceView | null {
  const board = info.board.filter(C.placed);
  const byId = new Map(board.map((part) => [part.id, part]));
  const matches = (part: Item) => byId.get(part.id)?.type === part.type;
  const selectedIds = new Set(selected.filter(matches).map((part) => part.id));
  const children = new Map<string, string[]>();
  const parents = new Map<string, string>();
  for (const part of board) {
    const parentId = Object.hasOwn(info.parents, part.id) ? info.parents[part.id] : undefined;
    const parent = parentId === undefined ? undefined : byId.get(parentId);
    if (!parent || parent.id === part.id || !D.PARTS[parent.type].container) continue;
    parents.set(part.id, parent.id);
    children.set(parent.id, [...children.get(parent.id) ?? [], part.id]);
  }
  function descendants(id: string): Set<string> {
    const found = new Set<string>(), pending = [...children.get(id) ?? []];
    while (pending.length) {
      const child = pending.pop()!;
      if (child === id || found.has(child)) continue;
      found.add(child);
      pending.push(...children.get(child) ?? []);
    }
    return found;
  }
  const unselectedDescendants = new Set<string>();
  const items = board.filter((part) => selectedIds.has(part.id)).flatMap((part) => {
    const parentId = parents.get(part.id), parent = parentId === undefined ? undefined : byId.get(parentId);
    const isContainer = !!D.PARTS[part.type].container;
    if (!parent && !isContainer) return [];
    const nested = descendants(part.id);
    for (const id of nested) if (!selectedIds.has(id)) unselectedDescendants.add(id);
    return [{
      id: part.id,
      name: targetCaption(part),
      parent: parent ? { id: parent.id, name: targetCaption(parent) } : null,
      isContainer,
      directChildCount: children.get(part.id)?.length ?? 0,
      descendantCount: nested.size,
    }];
  });
  if (!items.length) return null;
  return {
    items,
    selectedCount: selectedIds.size,
    unselectedDescendantCount: unselectedDescendants.size,
    editable: options.editable === true && selected.every((part) => matches(part) && C.placed(part)),
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

/** Compact, escaped selection-card fragment. No controls or mutation handlers. */
export function renderContainmentGuidance(view: ContainmentGuidanceView | null): string {
  if (!view) return "";
  const items = view.items.map((part) => {
    const parent = part.parent ? escape(part.parent.name) : "なし（ページ直下）";
    const counts = part.isContainer
      ? `<br>直下の子 ${part.directChildCount}個 / 入れ子全体の子孫 ${part.descendantCount}個`
      : "";
    return `<li style="overflow-wrap:anywhere"><span title="${escape(part.name)}">${escape(part.name)}</span><br>直接の親：${parent}${counts}</li>`;
  }).join("");
  let effects = "";
  if (view.editable) {
    const extra = view.unselectedDescendantCount;
    const nested = view.items.some((part) => part.descendantCount > 0);
    effects = `<p class="muted">選択中 ${view.selectedCount}個 / 未選択の子孫 ${extra}個（重複を除く）。ドラッグ・矢印キー・座標欄で移動すると、子孫も一緒に動きます。</p>
<p class="muted">手持ちへ戻すと、選択中のUIとその子孫の配置位置が失われます。所持数・サイズ・部品ラベル・資金は変わりません。${nested ? "親だけを置き直しても子は戻らず、個別に再配置が必要です。" : ""}</p>
<p class="muted">売却・削除は選択中のUIだけが対象です。${extra ? `未選択の子孫 ${extra}個は同じ位置に残り、直接の親は再判定されます。` : ""}最後のUIや物語の保護対象など、実行できない場合があります。</p>`;
  }
  return `<div class="sel-connect containment-guidance"><b>入れ子と操作の範囲</b><ul class="sel-bonus">${items}</ul>${effects}</div>`;
}
